'use strict';

module.exports = function(ServerlessPlugin, serverlessPath) {
  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    s3site       = require('s3-site'),
    _            = require('lodash'),
    mime         = require('mime'),
    fs           = require('fs');

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

      // Flow
      return new BbPromise(function(resolve, reject) {

        // Prompt: Stage
        if (!_this.S.config.interactive || _this.evt.options.stage) return resolve();

        return _this.cliPromptSelectStage('Client Deployer - Choose a stage: ', _this.evt.options.stage, false)
          .then(stage => {
            _this.evt.options.stage = stage;
            return resolve();
          })
      })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._processDeployment)
        .then(function() {

          // Line for neatness
          SCli.log('------------------------');

          // Display Failed Client Deployments
          if (_this.failed) {
            SCli.log('Failed to deploy the following clients in "'
              + _this.evt.options.stage
              + '" to the following regions:');
            // Display Errors
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].client + ': ' + region[j].message );
                SUtils.sDebug(region[j].stack);
              }
            }
          }

          // Display Successful Client Deployments
          if (_this.deployed) {

            // Status
            SCli.log('Successfully deployed clients in "'
              + _this.evt.options.stage
              + '" to the following regions: ');

            // Display Websites
            for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
              let region = _this.deployed[Object.keys(_this.deployed)[i]];
              SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].client);
              }
            }
          }

          /**
           * Return EVT
           */

          _this.evt.data.deployed = _this.deployed;
          _this.evt.data.failed   = _this.failed;
          return _this.evt;

        });

    }

    _validateAndPrepare() {

      let _this = this;

      if (!SUtils.dirExistsSync(path.join(_this.S.config.projectPath, 'client', 'dist'))) {
        return BbPromise.reject(new SError('Could not find "client/dist" folder in your project root.'));
      }

      // validate stage: make sure stage exists
      if (!_this.S.state.meta.get().stages[_this.evt.options.stage] && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // validate region if provided: make sure region exists in stage
      if (_this.evt.options.region) {
        if (!_this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region]) {
          return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
        }
      }

      // Instantiate Classes
      _this.project  = _this.S.state.getProject();
      _this.meta     = _this.S.state.getMeta();

      // Set Deploy Regions
      _this.regions  = _this.evt.options.region ? [_this.evt.options.region] : _this.S.state.getRegions(_this.evt.options.stage);
      _this.clientPath = path.join(_this.S.config.projectPath, 'client', 'dist');
      _this.bucketName = `${_this.project.name}.client.${_this.evt.options.stage}.${_this.evt.options.region}`;

      //_this.clients = fs.readdirSync(path.join(_this.S.config.projectPath, 'clients')).filter(function(file) {
      //  return fs.statSync(path.join(path.join(_this.S.config.projectPath, 'clients'), file)).isDirectory();
      //});



      return BbPromise.resolve();
    }

    _processDeployment() {

      let _this = this;

      // Status
      SCli.log('Deploying clients in "'
        + _this.evt.options.stage
        + '" to the following regions: '
        + _this.regions.join(', '));

      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
          return _this.regions;
        })
        .bind(_this)
        .each(function(region) {

          let awsConfig  = {
            region:          region,
            accessKeyId:     _this.S.config.awsAdminKeyId,
            secretAccessKey: _this.S.config.awsAdminSecretKey
          };

          _this.S3 = require('../utils/aws/S3')(awsConfig);

          return _this._destroyBucket()
            .bind(_this)
            .then(_this._createBucket)
            .then(_this._uploadDirectory(region, _this.clientPath))

        })
        .then(function() {

          // Stop Spinner
          _this._spinner.stop(true);
        });
    }


    _destroyBucket() {
      let _this = this;

      let params = {
        Bucket: _this.bucketName
      };

      return _this.S3.headBucketPromised(params)
        .then(function(){
          return _this.S3.listObjectsPromised(params);
        })
        .then(function(data){
          if (!data.contents[0]) {
            return BbPromise.resolve();
          } else {
            let Objects = _.map(data.contents, function (content) {
              return _.pick(content, 'Key');
            });

            let params = {
              Bucket: _this.bucketName,
              Delete: { Objects: Objects }
            };

            return _this.S3.deleteObjectsPromised(params);
          }
        })
        .then(function(){

          let params = {
            Bucket: _this.bucketName
          };

          return _this.S3.deleteBucketPromised(params);
        })
        .catch(function(err) {
          if (err.statusCode == 404) {
            return BbPromise.resolve();
          } else {
            return BbPromise.reject();
          }
        })
    }

    _createBucket() {
      let _this = this;

      let params = {
        Bucket: _this.bucketName
      };

      return _this.S3.createBucketPromised(params)
        .then(function() {
          let params = {
            Bucket: _this.bucketName,
            WebsiteConfiguration: {
              IndexDocument: { Suffix: 'index.html' }
            }
          };

          return _this.S3.putBucketWebsitePromised(params);
        })
        .then(function() {
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
                Resource: "arn:aws:s3:::"
              }
            ]
          };
          policy.Statement[0].Resource += _this.bucketName + '/*';

          let params = {
            Bucket: _this.bucketName,
            Policy: JSON.stringify(policy)
          };

          return _this.S3.putBucketPolicyPromised(params);
        });
    }

    _uploadDirectory(region, directoryPath) {
      let _this         = this,
        readDirectory = _.partial(fs.readdir, directoryPath);

      async.waterfall([readDirectory, function (files) {
        files = _.map(files, function(file) {
          return path.join(directoryPath, file);
        });

        async.each(files, function(path) {
          fs.stat(path, _.bind(function (err, stats) {

            return stats.isDirectory()
              ? _this._uploadDirectory(region, path)
              : _this._uploadFile(region, path);
          }, _this));
        });
      }]);

    }

    _uploadFile(region, filePath) {
      let _this      = this,
        fileKey    = filePath.replace(_this.clientPath, '').substr(1),
        bucketName = `${_this.project.name}.client.${_this.evt.options.stage}.${region}`;

      let awsConfig  = {
        region:          region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      let S3 = require('../utils/aws/S3')(awsConfig);

      fs.readFile(filePath, _.bind(function (err, fileBuffer) {
        let params = {
          Bucket: bucketName,
          Key: fileKey,
          Body: fileBuffer,
          ContentType: mime.lookup(filePath)
        };

        // TODO: remove browser caching

        return S3.putObject(params);
      }, this));

    }

  }
  return ClientDeploy;
};