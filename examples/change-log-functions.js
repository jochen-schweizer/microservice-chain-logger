const logger = require('../index');

const logFunction = logger.logFunctions.info = (...params) => {
    console.info.apply(console, params.map(p => p + '!!!'));
}
logger.info('something about %d kilogram of %s', 12.6, 'apples', 'peaches');

logger.logFunctions = {
    info: logFunction,
    debug: logFunction,
    error: logFunction,
    warn: logFunction
}

logger.error('something wrong abuot %s', 'apples');