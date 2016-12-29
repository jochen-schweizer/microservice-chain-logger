const logger = require('../index');
const app = require('express')();

// this initiates firing logger.info on each request
app.use(logger.initAccessLog());

app.get('/', (req, res) => {
  // here we use req as first parameter
  // making it possible to recognize X-Correlation-ID
  // the object req itself will NOT be logged
  logger.info(req, 'root called with headers', req.headers);
  res.send('Hello World');
});

// sample express error handler
app.use((err, req, res, next) => {
  // here we log a potential exception object (err)
  // it will be automatically recognized as an exception,
  // creating stack, file, line and column fields
  // in the resulting JSON
  logger.error(req, 'there was an error:', err);
  next();
});

app.listen(3000);

// just a normal log, no req needed here,
// since it's not in a HTTP-Request context
logger.info('call: curl http://localhost:3000/');
