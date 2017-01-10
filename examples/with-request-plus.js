// this demonstates, how you can preset correlationId
// and use an correlationId-bound http client
// this example assumes you run another example correlation.js on port 3000

const logger = require('../index');
const app = require('express')();
const requestPlus = require('request-plus');

const baseRequester = requestPlus()
  .plus.wrap('event')
  .plus.wrap('log');

app.use((req, res, next) => {
  // prepare a requester with a bound correlationId
  const defaultOpts = logger.assignCorrelationId(req, {});
  req.request = baseRequester.plus.wrap('defaults', defaultOpts);

  // prepare logger bound to request
  req.logger = {
    info: (...args) => logger.info(req, ...args),
    error: (...args) => logger.error(req, ...args)
  };

  next();
});

app.use(logger.initAccessLog());

app.get('/', (req, res, next) => {
  req.request('http://localhost:3000/subquery')
    .then(response => {
      req.logger.info('got answer:', response);
      res.send('success\n');
    })
    .catch(next);
});

app.listen(3001);
logger.info('call: curl http://localhost:3001/');
