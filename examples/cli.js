const logger = require('../index');
logger.transformEntry = logger.jsonTransformer;
logger.info('something about %d kilogram of %s', 12.6, 'apples', 'peaches');
logger.info({a: 1234}, 'hello object');
logger.warn(new Error('something \n multiline \n happened'));
logger.error(new Error('something serious happened'), '...oh no!');
