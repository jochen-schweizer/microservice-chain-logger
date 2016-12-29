[![build status](https://travis-ci.org/jochen-schweizer/microservice-chain-logger.png)](https://travis-ci.org/jochen-schweizer/microservice-chain-logger) [![Coverage Status](https://coveralls.io/repos/github/jochen-schweizer/microservice-chain-logger/badge.svg?branch=master)](https://coveralls.io/github/jochen-schweizer/microservice-chain-logger?branch=master) [![license](https://img.shields.io/github/license/mashape/apistatus.svg?maxAge=2592000)](https://www.tldrlegal.com/l/mit) [![NPM version](https://badge.fury.io/js/microservice-chain-logger.png)](http://badge.fury.io/js/microservice-chain-logger)

# microservice chain logger

JSON logger for microservices with bundled Correlation ID and http-server access logging,
created as a standard logging library for a family of microservices running in docker container.
Teh library incorporates the following features:

* wrappers for `console.info/warn/error` producing JSON inflated with extra information
* express access log middleware, using the same `info` wrapper
* reading/assigning of `X-Correlation-ID` which is automatically reflected in the log messages (including access logs)
* customizable message tranformer

All of the features are optional and you can use only the ones you need.

## Install

```
npm install microservice-chain-logger
```

## Usage

Basic example with express:

```javascript
const logger = require('microservice-chain-logger');
const app = require("express")();

// this initiates firing logger.info on each request
app.use(logger.initAccessLog());

app.get('/', (req, res) => {
  // here we use req as first parameter
  // making it possible to recognize X-Correlation-ID
  // the object req itself will NOT be logged
  logger.info(req, 'root called with headers', req.headers);
  res.send('Hello World');
})

// sample express error handler
app.use(function(err, req, res, next) => {
  // here we log a potential exception objectg (err)
  // it will be automatically recognized as an exception,
  // creating stack, file, line and column fields
  // in the resulting JSON
  logger.error(req, 'there was an error:', err);
  next();
});

app.listen(3000);

// just a normal log, no req needed here,
// since it's not in a HTTP-Request context
logger.info('application started')
```

## License

MIT
