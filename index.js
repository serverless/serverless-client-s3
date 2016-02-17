'use strict';

module.exports = function(ServerlessPlugin, serverlessPath) {
  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    s3site       = require('s3-site'),
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

      if (!SUtils.dirExistsSync(path.join(_this.S.config.projectPath, 'clients'))) {
        return BbPromise.reject(new SError('Could not find "clients" folder in your project root.'));
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

      _this.clients = fs.readdirSync(path.join(_this.S.config.projectPath, 'clients')).filter(function(file) {
        return fs.statSync(path.join(path.join(_this.S.config.projectPath, 'clients'), file)).isDirectory();
      });



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

          // Deploy clients in each region
          return _this._clientDeployByRegion(region);
        })
        .then(function() {

          // Stop Spinner
          _this._spinner.stop(true);
        });
    }

    _clientDeployByRegion(region) {
      let _this = this;
      s3site.deploy({
        name    : client + '.' + _this.evt.options.stage + '.serverless.client',
        region  : region,
        srcPath : path.join(_this.S.config.projectPath, 'clients', client)
      });
    }


  }
  return ClientDeploy;
};