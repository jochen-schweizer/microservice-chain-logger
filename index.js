const {inspect} = require('util');
const url = require('url');
const onFinished = require('on-finished');
const basicAuth = require('basic-auth');
const uuid = require('uuid');

const stackReg = /at\s+(.*)\s+\((.*):(\d*):(\d*)\)/i;

module.exports = {
  getCorrelationId,
  assignCorrelationId,

  textTransformer,
  transformEntry,
  makeEntry,
  applyLogFunction,

  info,
  error,
  debug,
  warn,

  infoSource,

  initAccessLog
};

function transformEntry(func, entry) {
  delete entry.isAccessLog;
  return JSON.stringify(entry);
}

function textTransformer(func, entry) {
  let result = entry.processTime;
  if (func === console.error) {
    result += ' ERR:';
  }
  result += ' ' + entry.message;
  if (entry.correlationId) {
    result += ` (c:${entry.correlationId})`;
  }
  if (entry.stack) {
    result += '\n' + entry.stack;
  }
  return result;
}

function getCorrelationId(req) {
  if (!req || !req.headers) {
    throw new Error('req.headers missing while trying to read correlationId');
  }
  return req.headers['x-correlation-id'] || uuid.v4();
}

/**
 * @param {Object} req - express Request
 * @param {Object} opts - options for reqeust http client
 * @return {Object} - mutated option for request
 */
function assignCorrelationId(req, opts) {
  // if opts is a string, then it's probably an URI for request('http://example.com', ...)
  if (typeof opts === 'string') {
    opts = {uri : opts};
  }
  if (!opts) {
    throw new Error('trying to assign correlationId to empty opts');
  }
  if (!req || !req.headers) {
    throw new Error('req.headers missing. Calling assignCorrelationId on not an express Request?');
  }
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
    column: data[4]
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
  if (isExpressReq(req)) {
    return module.exports.makeEntry(req, ...messages);
  } else {
    messages.unshift(req);
    return module.exports.makeEntry(null, ...messages);
  }
}

function makeEntry(req, ...messages) {
  const result = {};
  if (req) {
    if (req.headers['x-correlation-id']) {
      result.correlationId = req.headers['x-correlation-id'];
    }
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

function applyLogFunction(func, entry) {
  const transformed = module.exports.transformEntry(func, entry);
  if (transformed !== undefined) {
    func(transformed);
  }
}

function getOutput (func, req, ...messages) {
  const output = makeOutputObject(req, ...messages);
  module.exports.applyLogFunction(func, output);
}

/**
 * emit an info message with a refernece to the file, line, column
 */
function infoSource(req, ...messages) {
  const output = makeOutputObject(req, ...messages);
  Object.assign(output, getCodeAnchor());
  module.exports.applyLogFunction(console.info, output);
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

function initAccessLog(opts) {
  opts = opts || {};
  if (opts.useTextTransformer) {
    module.exports.transformEntry = module.exports.textTransformer;
  }
  return function(req, res, next) {
    const startTime = Date.now();
    onFinished(res, () => {
      const path = url.parse(req.originalUrl).pathname;
      const user = basicAuth(req);
      const userName = user ? user.name : '-';
      const output = makeOutputObject(req, userName, res.statusCode, req.method, path);
      output.isAccessLog = true;
      output.duration = Date.now() - startTime;
      module.exports.applyLogFunction(console.info, output);
    });
    next();
  };
}
