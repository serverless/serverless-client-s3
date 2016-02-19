serverless-client-s3
====================
A Serverless plugin that deploys a web client for your Serverless project to an S3 bucket, and make it publically available in seconds.

**First**, install:

```
npm install --save serverless-client-s3
```
**Second**, Add the plugin to `s-project.json`:

```
"plugins": [
  "serverless-client-s3"
]
```
**Third**, Create a `client/dist` folder in the root directory of your Serverless project. This is where your distribution-ready website should live. It is recommended to have a `client/src` where you'll be developing your website, and a build script that outputs to `client/dist`. The plugin simply expects and uploads the entire `client/dist` folder to S3, configure the bucket to host the website, and make it publically available.

Or just copy/run the following commands in the root directory of your Serverless project to get a quick sample website for deployment:
```
mkdir -p client/dist
touch client/dist/index.html
echo "Go Serverless!" >> client/dist/index.html
```

**Fourth**, run the plugin, and visit your new website!

```
sls client deploy
```

**Fifth**, Have fun!
