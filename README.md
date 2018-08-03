[![build status](https://travis-ci.org/jochen-schweizer/microservice-chain-logger.png)](https://travis-ci.org/jochen-schweizer/microservice-chain-logger) [![Coverage Status](https://coveralls.io/repos/github/jochen-schweizer/microservice-chain-logger/badge.svg?branch=master)](https://coveralls.io/github/jochen-schweizer/microservice-chain-logger?branch=master) [![license](https://img.shields.io/github/license/mashape/apistatus.svg?maxAge=2592000)](https://www.tldrlegal.com/l/mit) [![NPM version](https://badge.fury.io/js/microservice-chain-logger.png)](http://badge.fury.io/js/microservice-chain-logger)

# microservice chain logger

Text or JSON-formatted logger for microservices
with bundled Correlation ID and http-server access logging.

Features:

* wrappers for `console.info/warn/error` producing a text or JSON inflated with customizable metadata
* access log express middleware with additional metadata provided with the same API
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
app.use(logger.initAccessLog({
  // this (optional) setting tells that access log
  // and ALL OTHER LOGS should use JSON format
  useJsonTransformer: true
}));

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
Please note that the **logger** is a singleton meaning
any changes you make to it by replacing a function would
have immediate effect on the entire application.

## API

### logger.info(), logger.warn(), logger.error(), logger.debug()

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

Note: **logger.debug()** uses the same **console.info()** just like **logger.info()**

### logger.infoSource()

Same as **logger.info()** but adds **file**, **line** and **column** fields referencing
the code location where it was called

```javascript
// outputs "reached this point! in my_file.js:10:2"
logger.infoSource('reached this point!');
```

### logger.initAccessLog(opts)

* **opts** - `Object` or `undefined`

The access log can be used as a replacement for the `morgan` module,
keeping all of the logs in a consistent format and implicitly providing `correlationId` for each request.

The request duration is automatically measured and stored
in the **duration** field.

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

Options:
  * **useJsonTransformer** - replace default **textTransformer** with **jsonTransformer** function
  * **maxMessageLength** - override default `maxMessageLength=8000` for **jsonTransformer**
  * **injectIntoReq** - automatically create **req.logger** bound to the request
  * **assignCorrelationId** - automatically assign a new **correlationId**, if none was provided in headers

```javascript
// init access log and replace transformEntry
// so that it produces JSON when in production environment
app.use(logger.initAccessLog({
  useJsonTransformer: process.env.NODE_ENV === 'production',
  assignCorrelationId: true
}));
```

The access log middleware adds a field `isAccessLog` to the log
entry, which is then removed in the default `transformEntry`.
You can use this flag for special logic for messages coming from access log.

### logger.getCorrelationId(req)

Returns the value of `X-Correlation-ID` if provided in the header,
otherwise creates a new one using UUID v4.

```javascript
app.get('/', (req, res) => {
  res.send('correlationId is ' + logger.getCorrelationId(req));
});
```

Note `getCorrelationId()` also sets `X-Correlation-ID` header to current req,
thus if called twice it will return the same ID, and if called at least
once then the access log will already contain the correlation ID.

### logger.assignCorrelationId(req, opts)

Assigns `correlationId` to `request`-compatible `opts`-object.
It uses `getCorrelationId()` internally meaning it has the same
side effect on current req.

```javascript
const request = require('request');
app.get('/', (req, res, next) => {
  request(logger.assignCorrelationid(req, {
    uri: 'http://some.other.service/and/path'
  }))
    .then(() => {
      res.send('correlationId is ' + logger.getCorrelationId(req));
    })
    .catch(next);
});
```

An alternative way when using `superagent`:

```javascript
const superagent = require('superagent');
app.get('/', (req, res, next) => {
  superagent
    .get('http://some.other.service/and/path')
    .set('X-Correlation-ID', logger.getCorrelationId(req))
    .end(function(err, res){
      // Do something
    });
});
```

## Hacking API

For the most of the cases you should be fine with the functions above,
but feel free to hack the library at your on risk.

### logger.logFunctions property

**logger.logFunctions** is an object consisting of `{info, warn, error, debug}`

These functions can be used to override default core logging functions
(default core logging functions are `console.info`,
`console.debug`, `console.warn` and `console.error`).

You can either replace single functions, e.g.;

```js
logger.logFunctions.error = (error) => { /* ... send email ... */ };
```

... or replace the entire **logger.logFunctions** object.

[see an example](https://github.com/jochen-schweizer/microservice-chain-logger/blob/master/examples/change-log-functions.js)

### logger.transformEntry(func, entry)

Params:

* **func** - console logging function such as `console.info/warn/error`
* **entry** - the object containing the message and metadata to be logged

Returns `String` or `undefined`.

Returning `undefined` skips the current message.

Replacing this function allows customizing the log format
and log filtering. By default a text transformer is used (**logger.textTransformer**).
The text transformer supports displaying the following fields:

 * processTime
 * message
 * stack
 * file, line, column
 * duration

```javascript
// switch to JSON transformer instead
logger.transformEntry = logger.jsonTransformer;

// custom text transformer
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

### logger.applyLogFunction(func, entry)
Params:

* **func** - one of the loging functions: `console.info`, `console.warn` or `console.error`
* **entry** - message **object**

The unferlying function for `logger.info/warn/error`
working with the logging object instead of trying to format mixed parameters
as a single message string. It will **NOT** call `makeEntry`, so if you need
the context just call `makeEntry` explicitly to prepare the initial **entry**.

You can use it to inject specific custom fields directly from your code.
Most likely you want to set at least **message** and **processTime**
properties to keep it consistent with the rest of the library.

```javascript
logger.applyLogFunction(console.info, {
  message: "balloon started",
  color: "blue",
  size: "medium",
  processTime: (new Date()).toISOString()
});
```
... and yes, you can replace it to match you needs just like other functions above

## Using together with kraken.js

Here is a sample of how you can replace the standard **morgan** access log just by changing the config:

```json
{
  "middleware": {
    "logger": {
      "route": "/((?!metrics|status|favicon.ico|robots.txt))*",
      "priority": 0,
      "module": {
        "name": "microservice-chain-logger",
        "method": "initAccessLog",
        "arguments": [
          {
            "useJsonTransformer": true
          }
        ]
      }
    }
  }
}
```
... you may want to move the `arguments` part to `production.json`,
so that you get JSON in production environment only.

### More examles

[...See more advanced examples on github](https://github.com/jochen-schweizer/microservice-chain-logger/tree/master/examples)

## License

MIT
