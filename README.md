serverless-client-s3
====================
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![version](https://img.shields.io/npm/v/serverless-client-s3.svg)](https://www.npmjs.com/package/serverless-client-s3)
[![downloads](https://img.shields.io/npm/dm/serverless-client-s3.svg)](https://www.npmjs.com/package/serverless-client-s3)
[![dependencies](https://img.shields.io/david/serverless/serverless-client-s3.svg)](https://www.npmjs.com/package/serverless-client-s3)
[![license](https://img.shields.io/npm/l/serverless-client-s3.svg)](https://www.npmjs.com/package/serverless-client-s3)


A Serverless plugin that deploys a web client for your Serverless project to an S3 bucket, and make it publicaly available in seconds.

**First**, install:

```
npm install --save serverless-client-s3
```
**Second**, update `s-project.json` by adding the following:

```js
"plugins": [
  "serverless-client-s3"
],
"custom" : {
    "client": {
        "bucketName": "bucket.name.for.the.client"
    }
}
```

* **Warning:** The plugin will overwrite any data you have in the bucket name you set above if it already exists.
* **Pro Tip:** To add staging and region functionality to your client, use Serverless Variables in the bucket name: `"bucket.name.for.the.client.${stage}.${region}"`

* **Side Note** When hosting a client with a domain name, the bucket name must have exactly the same name as the domain. For this reason you may also optionally specify a regular expression to be replaced in your bucket name to remove, for instance, "prod." from the start of your bucket name:

```js
    "bucketName":"${stage}.my.example.com",
    "removeBucketRegex":"^prod\\.""
```

**Third**, Create a `client/dist` folder in the root directory of your Serverless project. This is where your distribution-ready website should live. It is recommended to have a `client/src` where you'll be developing your website, and a build script that outputs to `client/dist`. The plugin simply expects and uploads the entire `client/dist` folder to S3, configure the bucket to host the website, and make it publicly available.

Or just copy/run the following commands in the root directory of your Serverless project to get a quick sample website for deployment:

```
mkdir -p client/dist
touch client/dist/index.html
touch client/dist/error.html
echo "Go Serverless" >> client/dist/index.html
echo "error page" >> client/dist/error.html
```

**Fourth**, run the plugin, and visit your new website!

```
sls client deploy
```

**Fifth**, Have fun!
