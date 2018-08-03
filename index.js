const {format} = require('util');
const url = require('url');
const onFinished = require('on-finished');
const basicAuth = require('basic-auth');
const uuid = require('uuid');

const stackReg = /at\s+.*\s+\((.*):(\d*):(\d*)\)$/i;
const stackRegNoFunction = /at\s+(.*):(\d*):(\d*)$/i;

module.exports = {
  maxMessageLength: 8000,

  getCorrelationId,
  assignCorrelationId,

  textTransformer,
  jsonTransformer,
  transformEntry: textTransformer,
  makeEntry,
  applyLogFunction,

  logFunctions: {
    info: console.info,
    error: console.error,
    debug: console.debug,
    warn: console.warn
  },

  info,
  error,
  debug,
  warn,

  infoSource,

  initAccessLog
};

function jsonTransformer(func, entry) {
  delete entry.isAccessLog;
  if (typeof entry.message === 'string') {
    entry.message = entry.message.substring(0, module.exports.maxMessageLength);
  }
  return JSON.stringify(entry);
}

function textTransformer(func, entry) {
  let result = entry.processTime;
  if (func === module.exports.logFunctions.error) {
    result += ' ERR:';
  }
  result += ' ' + entry.message;
  if (entry.correlationId) {
    result += ` (c:${entry.correlationId})`;
  }
  if (entry.duration) {
    result += ` (d:${entry.duration}ms)`;
  }
  if (!entry.stack && entry.file && entry.line && entry.column) {
    result += ` in ${entry.file}:${entry.line}:${entry.column}`;
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
  req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || uuid.v4();
  return req.headers['x-correlation-id'];
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
  if (!req || !req.headers) {
    throw new Error('req.headers missing. Calling assignCorrelationId on not an express Request?');
  }
  const correlationId =  getCorrelationId(req);
  if (opts !== undefined) {
    if (!opts) {
      throw new Error('trying to assign correlationId to empty opts');
    }
    opts.headers = opts.headers || {};
    opts.headers['X-Correlation-ID'] = correlationId;
    return opts;
  }
}

function getDefaultData(...messages) {
  return {
    message: format(...messages),
    processTime: (new Date()).toISOString(),
  };
}

function stacklineToObject(line) {
  let data = stackReg.exec(line);
  if (!data) {
    data = stackRegNoFunction.exec(line);
  }
  return data && {
    file: data[1],
    line: parseInt(data[2]),
    column: parseInt(data[3])
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

      // we need to calculate the shift of stack line
      // depending on the count of lines in the message
      // for a rare case when an exception message has linebreaks
      const messageLines = message.message.split('\n').length;

      const lines = result.stack.split('\n');
      Object.assign(result, stacklineToObject(lines[messageLines]));
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

function getOutput(func, req, ...messages) {
  const output = makeOutputObject(req, ...messages);
  module.exports.applyLogFunction(func, output);
}

/**
 * emit an info message with a refernece to the file, line, column
 */
function infoSource(req, ...messages) {
  const output = makeOutputObject(req, ...messages);
  Object.assign(output, getCodeAnchor());
  module.exports.applyLogFunction(module.exports.logFunctions.info, output);
}

function info(req, ...messages) {
  getOutput(module.exports.logFunctions.info, req, ...messages);
}

function error(req, ...messages) {
  getOutput(module.exports.logFunctions.error, req, ...messages);
}

function debug(req, ...messages) {
  getOutput(module.exports.logFunctions.debug, req, ...messages);
}

function warn(req, ...messages) {
  getOutput(module.exports.logFunctions.warn, req, ...messages);
}

function initAccessLog(opts) {
  opts = opts || {};
  module.exports.maxMessageLength = opts.maxMessageLength || module.exports.maxMessageLength;
  if (opts.useTextTransformer !== undefined && !opts.useTextTransformer) {
    opts.useJsonTransformer = true;
  }
  if (opts.useJsonTransformer) {
    module.exports.transformEntry = module.exports.jsonTransformer;
  }
  return function(req, res, next) {
    if (opts.injectIntoReq) {
      req.logger = bindRequest(req);
    }
    if (opts.assignCorrelationId) {
      module.exports.assignCorrelationId(req);
    }
    const startTime = Date.now();
    onFinished(res, () => {
      const path = url.parse(req.originalUrl).pathname;
      const user = basicAuth(req);
      const userName = user ? user.name : '-';
      const output = makeOutputObject(req, userName, res.statusCode, req.method, path);
      output.isAccessLog = true;
      output.duration = Math.max(1, Date.now() - startTime);
      module.exports.applyLogFunction(module.exports.logFunctions.info, output);
    });
    next();
  };
}

/**
 * create a new logger object which already has
 * a req-parameter preset for all methods expecting it
 * (naive curring)
 */
function bindRequest(req) {
  return [
    'getCorrelationId',
    'assignCorrelationId',
    'makeEntry',
    'info',
    'error',
    'debug',
    'warn',
    'infoSource'
  ].reduce(
    (logger, methodName) => {
      logger[methodName] = (...args) => module.exports[methodName](req, ...args);
      return logger;
    },
    {}
  );
}
