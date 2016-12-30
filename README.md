[![build status](https://travis-ci.org/jochen-schweizer/microservice-chain-logger.png)](https://travis-ci.org/jochen-schweizer/microservice-chain-logger) [![Coverage Status](https://coveralls.io/repos/github/jochen-schweizer/microservice-chain-logger/badge.svg?branch=master)](https://coveralls.io/github/jochen-schweizer/microservice-chain-logger?branch=master) [![license](https://img.shields.io/github/license/mashape/apistatus.svg?maxAge=2592000)](https://www.tldrlegal.com/l/mit) [![NPM version](https://badge.fury.io/js/microservice-chain-logger.png)](http://badge.fury.io/js/microservice-chain-logger)

# microservice chain logger

JSON logger for microservices with bundled Correlation ID and http-server access logging.

Features:

* wrappers for `console.info/warn/error` producing a JSON inflated with customizable metadata
* express access log middleware providing metadata through the same API
* reading/assigning `X-Correlation-ID` which is automatically reflected in the log messages (including access logs)

All of the features are optional and you can use only the ones you need.

## Install

```
npm install microservice-chain-logger
```

## Basic example

```javascript
const logger = require('microservice-chain-logger');
const app = require('express')();

// this initiates firing logger.info on each request
// with basic access log information: user, status code, method, path
app.use(logger.initAccessLog());

app.get('/', (req, res) => {
  // here we use req as the first parameter
  // making it possible to recognize X-Correlation-ID
  // The object req itself will NOT be logged
  logger.info(req, 'root called with headers', req.headers);
  res.send('Hello World');
});

// sample express error handler
app.use((err, req, res, next) => {
  // Here we log a potential exception object (err).
  // It will be automatically recognized as an exception,
  // creating stack, file, line and column fields
  // in the resulting JSON
  logger.error(req, 'there was an error:', err);
  next();
});

app.listen(3000);

// just a normal log, no req needed here,
// since it's not in a HTTP-Request context
logger.info('call: curl http://localhost:3000/');
```

## API

### logger.info(), logger.warn(), logger.error()

These functions correspond to `console` but also add metadata,
e.g. `processTime`, `correlationId` and any other data you inject
using `transformEntry`.

The first parameter has a special meaning. If it's an instance
of **express Request**, then it's not logged but used as a context,
e.g. as a source for `correlationId`

```javascript
app.get('/some/route', (req, res) => {
  logger.info('just some text');
  logger.warn('you', {can: 'mix'}, 'different', ['types', 1337]);
  logger.info(req, 'message with meta data', {from: 'the req'});
});
```
### logger.initAccessLog(opts)

* **opts** - `Object` or `undefined`

The access log can be used as a replacement for the `morgan` module,
keeping all of the logs in a consistent format and implicitly providing `correlationId` for each request.

The access log middleware adds a field `isAccessLog` to the log
entry, which is then removed in the default `transformEntry`.
You can use this flag for special logic for messages coming from access log.

```javascript
// access log will not be triggered for /status
// because it comes BEFORE acess log middleware
app.get('/status', (req, res) => res.send('healthy'));

// register access log middleware
app.use(logger.initAccessLog());

app.get('/', (req, res) => {
  res.send('requests to this and further routes will be logged');
});
```

The only supported option
is **useTextTransformer**, which is a shortcut for replacing **transformEntry**
function.

```javascript
// init access log and replace transformEntry,
// so that it produces text logs instead of JSON when in dev. mode
app.use(logger.initAccessLog({
  useTextTransformer: process.env.NODE_ENV === 'development'
}));
```

### logger.getCorrelationId(req)

Returns the value of `X-Correlation-ID` if provided in the header,
otherwise creates a new one using UUID v4.

```javascript
app.get('/', (req, res) => {
  res.send('correlationId is ' + logger.getCorrelationId(req));
});
```

### logger.assignCorrelationId(req, opts)

Assigns `correlationId` to `request`-compatible `opts`-object.
If a new correlation ID was generated then it's also assigned
to the current `req`. This ensures that it appears in all
subsequent log messages and eventually in the access log.

```javascript
app.get('/', (req, res) => {
  res.send('correlationId is ' + logger.getCorrelationId(req));
});
```

### logger.transformEntry(func, entry)

Params:

* **func** - console logging function such as `console.info/warn/error`
* **entry** - the object containing the message and metadata to be logged

Returns `String` or `undefined`.

Replacing this function allows customizing the log format
and log filtering. By default JSON transformer is used.

```javascript
logger.transformEntry = (func, entry) => {
  // suppress info logging, but keep access logs
  if (!entry.isAccessLog && func === console.info) {
    return;
  }

  // output logs as text instead of JSON
  return entry.processTime + ' ' + entry.message;
};
```

### logger.makeEntry(req, ...messages)
Params:

* **req** - **express Request** or `null`
* **...messages** - mixed

Returns `Object`.

Replacing this function allows you to alter metadata injection,
on the step BEFORE `transformEntry`, e.g. if you want to inject
something from `req` other than just `correlationId`

```javascript
// extend makeEntry(), so that each record also includes HTTP method
const origianlMakeEntry = logger.makeEntry;
logger.makeEntry = (req, ...messages) => {
  const result = origianlMakeEntry(req, ...messages);
  if (req) {
    result.method = req.method;
  }
  return result;
};
```
## using together with kraken.js

Here is a sample of how you can replace the standard **morgan** access log just by changing the config:

```json
{
  "middleware": {
    "logger": {
      "route": "/((?!metrics|status|favico.ico|robots.txt))*",
      "priority": 0,
      "module": {
        "name": "microservice-chain-logger",
        "method": "initAccessLog",
        "arguments": [
          {
            "useTextTransformer": true
          }
        ]
      }
    }
  }
}
```
... you may want to move the `arguments` part to `development.json`,
so that in production you get JSON.

### More examles

See more advanced examples on github:

* [tranformEntry()](https://github.com/jochen-schweizer/microservice-chain-logger/blob/master/examples/transformEntry.js)
* [correlation id and makeEntry()](https://github.com/jochen-schweizer/microservice-chain-logger/blob/master/examples/correlation.js)

## License

MIT
