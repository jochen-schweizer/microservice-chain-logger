const {inspect} = require('util');
const url = require('url');
const onFinished = require('on-finished');
const basicAuth = require('basic-auth');
const uuid = require('uuid');

const stackReg = /at\s+(.*)\s+\((.*):(\d*):(\d*)\)/i;

module.exports = {
  getCorrelationId,
  assignCorrelationId,

  transformEntry: defaultTransformer,

  info,
  error,
  debug,
  warn,

  infoSource,

  initAccessLog
};

function defaultTransformer(entry) {
  entry.taskId = process.env.MESOS_TASK_ID;
  return JSON.stringify(entry);
}

function getCorrelationId(req) {
  return req.headers['x-correlation-id'] || uuid.v4();
}

/**
 * @param {Object} opts - options for reqeust http client
 * @param {Object} req - express Request
 * @return {Object} - mutated option for request
 */
function assignCorrelationId(opts, req) {
  opts.headers = opts.headers || {};
  opts.headers['X-Correlation-ID'] = getCorrelationId(req);
  req.headers['x-correlation-id'] = opts.headers['X-Correlation-ID'];
  return opts;
}

function formatMessage(message) {
  return typeof message == 'object' ? inspect(message) : String(message);
}

function getDefaultData(...messages) {
  return {
    message: messages.map(formatMessage).join(' '),
    processTime: (new Date()).toISOString(),
  };
}

function stacklineToObject(line) {
  const data = stackReg.exec(line);
  return {
    file: data[2],
    line: data[3],
    col: data[4]
  };
}

function getCodeAnchor() {
  const s = (new Error()).stack.split('\n')[3];
  return stacklineToObject(s);
}

function isExpressReq(req) {
  return !!(req && req.headers && req.method);
}

function makeOutputObject(req, ...messages) {
  const result = {};
  if (isExpressReq(req)) {
    if (req.headers['x-correlation-id']) {
      result.correlationId = req.headers['x-correlation-id'];
    }
  } else {
    messages.unshift(req);
  }

  // parse and transform exceptions
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message instanceof Error) {
      result.stack = message.stack;
      messages[i] = message.message;
      const lines = result.stack.split('\n');
      Object.assign(result, stacklineToObject(lines[1]));
    }
  }
  return Object.assign(result, getDefaultData(...messages));
}

function getOutput (func, req, ...messages) {
  const output = makeOutputObject(req, ...messages);
  func(module.exports.transformEntry(output));
}

/**
 * info a message with a refernece to the file, line, col
 */
function infoSource(req, ...messages) {
  const output = makeOutputObject(req, ...messages);
  Object.assign(output, getCodeAnchor());
  console.info(module.exports.transformEntry(output));
}

function info (req, ...messages) {
  getOutput(console.info, req, ...messages);
}

function error (req, ...messages) {
  getOutput(console.error, req, ...messages);
}

function debug (req, ...messages) {
  getOutput(console.info, req, ...messages);
}

function warn (req, ...messages) {
  getOutput(console.warn, req, ...messages);
}

function initAccessLog() {
  return function(req, res, next) {
    onFinished(res, () => {
      const path = url.parse(req.originalUrl).pathname;
      const user = basicAuth(req);
      const userName = user ? user.name : '-';
      info(req, userName, res.statusCode, req.method, path);
    });
    next();
  };
}
