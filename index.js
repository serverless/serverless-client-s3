'use strict';

module.exports = function(ServerlessPlugin, serverlessPath) {
  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'Error')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    _            = require('lodash'),
    mime         = require('mime'),
    fs           = require('fs');

  let SUtils;
  class ClientDeploy extends ServerlessPlugin {
    constructor(S) {
      super(S);
    }

    static getName() {
      return 'serverless.plugins.' + ClientDeploy.name;
    }

    registerActions() {
      this.S.addAction(this.clientDeploy.bind(this), {
        handler:       'clientDeploy',
        description:   `Deploy your Serverless clients to S3 Website Bucket.`,
        context:       'client',
        contextAction: 'deploy',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'Optional - JS file to run as custom initialization code'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Optional - add URL prefix to each lambda'
          }
        ]
      });
      return BbPromise.resolve();
    }

    clientDeploy(evt) {

      let _this     = this;
      _this.evt     = evt;

      SUtils = _this.S.utils;

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

      return _this.cliPromptSelectStage('Client Deployer - Choose Stage: ', _this.evt.options.stage, true)
        .then(stage => {
          _this.evt.options.stage = stage;
          BbPromise.resolve();
        })
        .then(function(){
          return _this.cliPromptSelectRegion('Client Deployer - Choose Region: ', true, true, _this.evt.options.region, _this.evt.options.stage)
            .then(region => {
              _this.evt.options.region = region;
              BbPromise.resolve();
            });
        });

    }


    _validateAndPrepare() {

      let _this = this;

      if (!SUtils.dirExistsSync(path.join(_this.S.config.projectPath, 'client', 'dist'))) {
        return BbPromise.reject(new SError('Could not find "client/dist" folder in your project root.'));
      }

      // validate stage: make sure stage exists
      if (!_this.S.getProject().validateStageExists(_this.evt.options.stage)) {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // make sure region exists in stage
      if (!_this.S.getProject().validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
      }

      _this.project    = _this.S.getProject();
      _this.aws        = _this.S.getProvider('aws');
      _this.projectBucketRegion = _this.S.getProject().getVariables().projectBucketRegion;
      _this.bucketName = `${_this.project.getName()}.client.${_this.evt.options.stage}.${_this.evt.options.region}`;
      _this.clientPath = path.join(_this.project.getRootPath(), 'client', 'dist');

      return BbPromise.resolve();
    }

    _processDeployment() {

      let _this = this;

      SCli.log('Deploying client to stage "' + _this.evt.options.stage + '" in region "' + _this.evt.options.region + '"...');

      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return _this.aws.request('S3', 'listBuckets', {}, _this.evt.options.stage, _this.projectBucketRegion)
        .bind(_this)
        .then(function(data) {
          data.Buckets.forEach(function(bucket) {
            if (bucket.Name === _this.bucketName) {
              _this.bucketExists = true;
              SUtils.sDebug(`Bucket ${_this.bucketName} already exists`);
            }
          });
        })
        .then(function(){
          if (!_this.bucketExists) return BbPromise.resolve();

          SUtils.sDebug(`Listing objects in bucket ${_this.bucketName}...`);

          let params = {
            Bucket: _this.bucketName
          };
          return _this.aws.request('S3', 'listObjects', params, _this.evt.options.stage, _this.projectBucketRegion)
        })
        .then(function(data){
          if (!_this.bucketExists) return BbPromise.resolve();

          SUtils.sDebug(`Deleting all objects from bucket ${_this.bucketName}...`);

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
            return _this.aws.request('S3', 'deleteObjects', params, _this.evt.options.stage, _this.projectBucketRegion)
          }})
        .then(function(){
          if (!_this.bucketExists) return BbPromise.resolve();

          SUtils.sDebug(`Deleting bucket ${_this.bucketName}...`);

          let params = {
            Bucket: _this.bucketName
          };
          return _this.aws.request('S3', 'deleteBucket', params, _this.evt.options.stage, _this.projectBucketRegion)
        })
        .then(function(){

          SUtils.sDebug(`Creating bucket ${_this.bucketName}...`);

          let params = {
            Bucket: _this.bucketName
          };
          return _this.aws.request('S3', 'createBucket', params, _this.evt.options.stage, _this.projectBucketRegion)
        })
        .then(function(){

          SUtils.sDebug(`Configuring website bucket ${_this.bucketName}...`);

          let params = {
            Bucket: _this.bucketName,
            WebsiteConfiguration: {
              IndexDocument: { Suffix: 'index.html' }
            }
          };
          return _this.aws.request('S3', 'putBucketWebsite', params, _this.evt.options.stage, _this.projectBucketRegion)
        })
        .then(function(){

          SUtils.sDebug(`Configuring policy for bucket ${_this.bucketName}...`);

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
          return _this.aws.request('S3', 'putBucketPolicy', params, _this.evt.options.stage, _this.projectBucketRegion)
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
        fileKey    = filePath.replace(_this.clientPath, '').substr(1);

      SUtils.sDebug(`Uploading file ${fileKey} to bucket ${_this.bucketName}...`);

      fs.readFile(filePath, function(err, fileBuffer) {

        let params = {
          Bucket: _this.bucketName,
          Key: fileKey,
          Body: fileBuffer,
          ContentType: mime.lookup(filePath)
        };

        // TODO: remove browser caching
        return _this.aws.request('S3', 'putObject', params, _this.evt.options.stage, _this.projectBucketRegion)
      });

    }

  }
  return ClientDeploy;
};