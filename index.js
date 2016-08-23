'use strict';

const path     = require('path');
const BbPromise    = require('bluebird');
const async        = require('async');
const _            = require('lodash');
const mime         = require('mime');
const fs           = require('fs');
const AWS = require('serverless/lib/plugins/aws');

class Client {
  constructor(serverless, options){
    this.serverless = serverless;
    this.options = options;
    
    this.commands = {
      client: {
        usage: 'Generate and deploy clients',
        lifecycleEvents:[
          'client',
          'deploy'
        ],
        commands: {
          deploy: {
            usage: 'Deploy serverless client code',
            lifecycleEvents:[
              'deploy'
            ]
          }
        }
      }
    };


    this.hooks = {
      'client:client': () => {
        this.serverless.cli.log(this.commands.client.usage);
      },

      'client:deploy:deploy': this._prompt.bind(this),
    };
  }

  _prompt() {
    this._validateAndPrepare()
      .then(this._processDeployment.bind(this));
  }

  _validateAndPrepare() {
    const Utils = this.serverless.utils;
    const Error = this.serverless.classes.Error;


    if (!Utils.dirExistsSync(path.join(this.serverless.config.servicePath, 'client', 'dist'))) {
      return BbPromise.reject(new Error('Could not find "client/dist" folder in your project root.'));
    }

    const stage = this.serverless.service.getStage(this.options.stage);
    const region = this.serverless.service.getRegionInStage(this.options.stage, this.options.region);
    
    if (!this.serverless.service.custom.client || !this.serverless.service.custom.client.bucketName) {
      return BbPromise.reject(new Error('Please specify a bucket name for the client in s-project.json'));
    }

    this.bucketName = this.serverless.service.custom.client.bucketName;
    this.clientPath = path.join(this.serverless.config.servicePath, 'client', 'dist');

    return BbPromise.resolve();
  }

 
  _processDeployment() {
    const SDK = new AWS(this.serverless);    
    this.serverless.cli.log('Deploying client to stage "' + this.options.stage + '" in region "' + this.options.region + '"...');


    function listBuckets(data) {
      data.Buckets.forEach(function(bucket) {
        if (bucket.Name === this.bucketName) {
          this.bucketExists = true;
          this.serverless.cli.log(`Bucket ${this.bucketName} already exists`);
        }
      });
    }

    function listObjectsInBucket() {
      if (!this.bucketExists) return BbPromise.resolve();

      this.serverless.cli.log(`Listing objects in bucket ${this.bucketName}...`);

      let params = {
        Bucket: this.bucketName
      };
      return SDK.request('S3', 'listObjects', params, this.options.stage, this.options.region);
    }

    function deleteObjectsFromBucket(data) {
      if (!this.bucketExists) return BbPromise.resolve();

      this.serverless.cli.log(`Deleting all objects from bucket ${this.bucketName}...`);

      if (!data.Contents[0]) {
        return BbPromise.resolve();
      } else {
        let Objects = _.map(data.Contents, function (content) {
          return _.pick(content, 'Key');
        });

        let params = {
          Bucket: this.bucketName,
          Delete: { Objects: Objects }
        };
        
        return _SDK.request('S3', 'deleteObjects', params, _this.options.stage, _this.options.region)
      }
    }

    function createBucket() {
      if (this.bucketExists) return BbPromise.resolve();
      this.serverless.cli.log(`Creating bucket ${this.bucketName}...`);

      let params = {
        Bucket: this.bucketName
      };
      
      return SDK.request('S3', 'createBucket', params, this.options.stage, this.options.region)
    }

    function configureBucket() {
      this.serverless.cli.log(`Configuring website bucket ${this.bucketName}...`);

      let params = {
        Bucket: this.bucketName,
        WebsiteConfiguration: {
          IndexDocument: { Suffix: 'index.html' },
          ErrorDocument: { Key: 'error.html' }
        }
      };
      
      return SDK.request('S3', 'putBucketWebsite', params, this.options.stage, this.options.region)
    }

    function configurePolicyForBucket(){
      this.serverless.cli.log(`Configuring policy for bucket ${this.bucketName}...`);

      let policy = {
        Version: "2008-10-17",
        Id: "Policy1392681112290",
        Statement: [
          {
            Sid: "Stmt1392681101677",
            Effect: "Allow",
            Principal: {
              AWS: "*"
            },
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::" + this.bucketName + '/*'
          }
        ]
      };

      let params = {
        Bucket: this.bucketName,
        Policy: JSON.stringify(policy)
      };
      
      return SDK.request('S3', 'putBucketPolicy', params, this.options.stage, this.evt.options.region)
    }
 
    return SDK.request('S3', 'listBuckets', {}, this.options.stage, this.options.region)
      .bind(this)
      .then(listBuckets)
      .then(listObjectsInBucket)
      .then(deleteObjectsFromBucket)
      .then(createBucket)
      .then(configureBucket)
      .then(configurePolicyForBucket)
      .then(function(){
        return this._uploadDirectory(this.clientPath)
      });
  }

  _uploadDirectory(directoryPath) {
    let _this         = this,
        readDirectory = _.partial(fs.readdir, directoryPath);

    async.waterfall([readDirectory, function (files) {
      files = _.map(files, function(file) {
        return path.join(directoryPath, file);
      });

      async.each(files, function(path) {
        fs.stat(path, _.bind(function (err, stats) {

          return stats.isDirectory()
            ? _this._uploadDirectory(path)
            : _this._uploadFile(path);
        }, _this));
      });
    }]);

  }  

}

module.exports = Client;












const cool =  function(S) {
  const path     = require('path'),
    SError       = require(S.getServerlessPath('Error')),
    SCli         = require(S.getServerlessPath('utils/cli')),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    _            = require('lodash'),
    mime         = require('mime'),
    fs           = require('fs');

  class ClientDeploy extends S.classes.Plugin {

    constructor() {
      super();
      this.name = 'serverless-client-s3';
    }

    registerActions() {
      S.addAction(this.clientDeploy.bind(this), {
        handler:       'clientDeploy',
        description:   `Deploy your Serverless clients to S3 Website Bucket.`,
        context:       'client',
        contextAction: 'deploy',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage to populate any variables'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'region to populate any variables'
          }
        ]
      });
      return BbPromise.resolve();
    }

    clientDeploy(evt) {

      let _this     = this;
      _this.evt     = evt;

      // Flow
      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._processDeployment)
        .then(function() {

          _this._spinner.stop(true);
          SCli.log(`Finishing deployment...`);

          // display friendly message after all async operations (file uploads) are finished
          process.on('exit', function (){
            SCli.log(`Successfully deployed client to: ${_this.bucketName}.s3-website-${_this.evt.options.region}.amazonaws.com`);
          });

          return _this.evt;

        });

    }


    _prompt() {

      let _this = this;

      return this.cliPromptSelectStage('Client Deployer - Choose stage: ', this.evt.options.stage, false)
          .then(stage => this.evt.options.stage = stage)
          .then(() => this.cliPromptSelectRegion('Choose a Region in this Stage: ', false, true, _this.evt.options.region, _this.evt.options.stage))
          .then(region => this.evt.options.region = region);

    }


    _validateAndPrepare() {

      let _this = this;

      if (!S.utils.dirExistsSync(path.join(S.config.projectPath, 'client', 'dist'))) {
        return BbPromise.reject(new SError('Could not find "client/dist" folder in your project root.'));
      }

      // validate stage: make sure stage exists
      if (!S.getProject().validateStageExists(_this.evt.options.stage)) {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // make sure region exists in stage
      if (!S.getProject().validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
      }

      _this.project    = S.getProject();
      _this.aws        = S.getProvider('aws');

      let populatedProject = _this.project.toObjectPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region});

      if (!populatedProject.custom.client || !populatedProject.custom.client.bucketName) {
        return BbPromise.reject(new SError('Please specify a bucket name for the client in s-project.json'));
      }

      _this.bucketName = populatedProject.custom.client.bucketName;
      _this.clientPath = path.join(_this.project.getRootPath(), 'client', 'dist');

      return BbPromise.resolve();
    }

    _processDeployment() {

      let _this = this;

      SCli.log('Deploying client to stage "' + _this.evt.options.stage + '" in region "' + _this.evt.options.region + '"...');

      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return _this.aws.request('S3', 'listBuckets', {}, _this.evt.options.stage, _this.evt.options.region)
        .bind(_this)
        .then(function(data) {
          data.Buckets.forEach(function(bucket) {
            if (bucket.Name === _this.bucketName) {
              _this.bucketExists = true;
              S.utils.sDebug(`Bucket ${_this.bucketName} already exists`);
            }
          });
        })
        .then(function(){
          if (!_this.bucketExists) return BbPromise.resolve();

          S.utils.sDebug(`Listing objects in bucket ${_this.bucketName}...`);

          let params = {
            Bucket: _this.bucketName
          };
          return _this.aws.request('S3', 'listObjects', params, _this.evt.options.stage, _this.evt.options.region)
        })
        .then(function(data){
          if (!_this.bucketExists) return BbPromise.resolve();

          S.utils.sDebug(`Deleting all objects from bucket ${_this.bucketName}...`);

          if (!data.Contents[0]) {
            return BbPromise.resolve();
          } else {
            let Objects = _.map(data.Contents, function (content) {
              return _.pick(content, 'Key');
            });

            let params = {
              Bucket: _this.bucketName,
              Delete: { Objects: Objects }
            };
            return _this.aws.request('S3', 'deleteObjects', params, _this.evt.options.stage, _this.evt.options.region)
          }})
        .then(function(){
          if (_this.bucketExists) return BbPromise.resolve();
          S.utils.sDebug(`Creating bucket ${_this.bucketName}...`);

          let params = {
            Bucket: _this.bucketName
          };
          return _this.aws.request('S3', 'createBucket', params, _this.evt.options.stage, _this.evt.options.region)
        })
        .then(function(){

          S.utils.sDebug(`Configuring website bucket ${_this.bucketName}...`);

          let params = {
            Bucket: _this.bucketName,
            WebsiteConfiguration: {
              IndexDocument: { Suffix: 'index.html' },
              ErrorDocument: { Key: 'error.html' }
            }
          };
          return _this.aws.request('S3', 'putBucketWebsite', params, _this.evt.options.stage, _this.evt.options.region)
        })
        .then(function(){

          S.utils.sDebug(`Configuring policy for bucket ${_this.bucketName}...`);

          let policy = {
            Version: "2008-10-17",
            Id: "Policy1392681112290",
            Statement: [
              {
                Sid: "Stmt1392681101677",
                Effect: "Allow",
                Principal: {
                  AWS: "*"
                },
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::" + _this.bucketName + '/*'
              }
            ]
          };

          let params = {
            Bucket: _this.bucketName,
            Policy: JSON.stringify(policy)
          };
          return _this.aws.request('S3', 'putBucketPolicy', params, _this.evt.options.stage, _this.evt.options.region)
        })
        .then(function(){
          return _this._uploadDirectory(_this.clientPath)
        });
    }

    _uploadDirectory(directoryPath) {
      let _this         = this,
        readDirectory = _.partial(fs.readdir, directoryPath);

      async.waterfall([readDirectory, function (files) {
        files = _.map(files, function(file) {
          return path.join(directoryPath, file);
        });

        async.each(files, function(path) {
          fs.stat(path, _.bind(function (err, stats) {

            return stats.isDirectory()
              ? _this._uploadDirectory(path)
              : _this._uploadFile(path);
          }, _this));
        });
      }]);

    }

    _uploadFile(filePath) {
      let _this      = this,
          fileKey    = filePath.replace(_this.clientPath, '').substr(1).replace('\\', '/');

      S.utils.sDebug(`Uploading file ${fileKey} to bucket ${_this.bucketName}...`);

      fs.readFile(filePath, function(err, fileBuffer) {

        let params = {
          Bucket: _this.bucketName,
          Key: fileKey,
          Body: fileBuffer,
          ContentType: mime.lookup(filePath)
        };

        // TODO: remove browser caching
        return _this.aws.request('S3', 'putObject', params, _this.evt.options.stage, _this.evt.options.region)
      });

    }

  }
  return ClientDeploy;
};
