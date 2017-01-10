const logger = require('../index');
const app = require('express')();
const requestPromise = require('request-promise');

// extend makeEntry(), so that each record also includes HTTP method
// if it's available, i.e. if req was provided
const origianlMakeEntry = logger.makeEntry;
logger.makeEntry = (req, ...messages) => {
  const result = origianlMakeEntry(req, ...messages);
  if (req) {
    result.method = req.method;
  }
  return result;
};

app.use(logger.initAccessLog({
  useJsonTransformer: process.env.NODE_ENV === 'production'
}));

app.get('/', (req, res) => {
  res.send('ok');
});

app.listen(3000);
logger.info('call: curl http://localhost:3000/');
