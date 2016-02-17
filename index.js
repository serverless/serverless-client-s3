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

  class DeployWebsite extends ServerlessPlugin {
    constructor(S) {
      super(S);
    }

    static getName() {
      return 'serverless.plugins.' + DeployWebsite.name;
    }

    registerActions() {
      this.S.addAction(this.deployWebsite.bind(this), {
        handler:       'deployWebsite',
        description:   `Deploy your serverless static site to S3 Website Bucket.`,
        context:       'website',
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
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Deploy all Websites'
          }
        ]
      });
      return BbPromise.resolve();
    }

    deployWebsite(evt) {

      let _this     = this;
      _this.evt     = evt;

      // Flow
      return new BbPromise(function(resolve, reject) {

        // Prompt: Stage
        if (!_this.S.config.interactive || _this.evt.options.stage) return resolve();

        if (!_this.S.state.meta.getStages().length) return reject(new SError('No existing stages in the project'));

        return _this.cliPromptSelectStage('Website Deployer - Choose a stage: ', _this.evt.options.stage, false)
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

          // Display Failed Website Deployments
          if (_this.failed) {
            SCli.log('Failed to deploy the following websites in "'
              + _this.evt.options.stage
              + '" to the following regions:');
            // Display Errors
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].websiteName + ': ' + region[j].message );
                SUtils.sDebug(region[j].stack);
              }
            }
          }

          // Display Successful Website Deployments
          if (_this.deployed) {

            // Status
            SCli.log('Successfully deployed websites in "'
              + _this.evt.options.stage
              + '" to the following regions: ');

            // Display Websites
            for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
              let region = _this.deployed[Object.keys(_this.deployed)[i]];
              SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].websiteName);
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

      // Set Defaults
      _this.evt.options.stage = _this.evt.options.stage ? _this.evt.options.stage : null;

      // Validate Stage
      if (!_this.evt.options.stage) throw new SError(`Stage is required`);

      // Instantiate Classes
      _this.project  = _this.S.state.getProject();
      _this.meta     = _this.S.state.getMeta();

      // Set Deploy Regions
      _this.regions  = _this.evt.options.region ? [_this.evt.options.region] : _this.S.state.getRegions(_this.evt.options.stage);

      _this.websiteName = SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 'client', 's-client-s3.json')).name;
      _this.websitepath = SUtils.readAndParseJsonSync(path.join(_this.S.config.projectPath, 'client')).name;

      return BbPromise.resolve();
    }

    _processDeployment() {

      let _this = this;

      // Status
      SCli.log('Deploying websites in "'
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

          // Deploy websites in each region
          return _this._deployWebsitesByRegion(region);
        })
        .then(function() {

          // Stop Spinner
          _this._spinner.stop(true);
        });
    }

    _deployWebsitesByRegion(region) {
      let _this = this;

      s3site.deploy({
        name    : _this.evt.options.stage + ,
        env     : [env],
        prefix  : [prefix],
        region  : region,
        srcPath : [src]
      });

    }


  }
  return DeployWebsite;
};