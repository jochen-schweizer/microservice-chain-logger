const logger = require('../index');
const app = require('express')();
const requestPromise = require('request-promise');

app.use(logger.initAccessLog());

app.get('/', (req, res, next) => {
  // We make an HTTP request from current microservice
  // to another one (in example it's the same)

  // assignCorrelationId() expects you to use requst-library notation
  // you can use request, request-promise, request-plus
  // ... or any other http-libraries of the same family
  const opts = {uri: 'http://localhost:3000/subquery'};
  logger.assignCorrelationId(req, opts);

  requestPromise(opts)
    .then(response => {
      // here we pass req to keep the correlationId context
      // so that the explicit logging calls also show correlationId
      logger.info(req, 'got answer:', response);
      res.send('success');
    })
    .catch(next); // pass failed request to std. error handler
});

app.get('/subquery', (req, res) => {
  logger.info(req, 'in subquery');
  res.json({someJson: 'payload'});
});

app.use((err, req, res, next) => {
  logger.error(req, 'there was an error:', err);
  res.sendStatus(500);
});

app.listen(3000);
logger.info('call: curl http://localhost:3000/');
