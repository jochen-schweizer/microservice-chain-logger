/* eslint-env jasmine */
const stub = {
  info: () => {},
  warn: () => {},
  error: () => {}
};
const rewire = require('rewire');
const lib = rewire('./index');
lib.__set__('console', stub);

const express = require('express');
const supertest = require('supertest');

describe('microservice-chain-logger', () => {
  describe('correlation id', () => {
    it('reads correlationId from header', () => {
      const req = {headers: {'x-correlation-id': '54321'}, method: 'GET'};
      const correlationId = lib.getCorrelationId(req);
      expect(correlationId).toBe('54321');
    });

    it('creates new correlationId', () => {
      const req = {headers: {}, method: 'GET'};
      const correlationId = lib.getCorrelationId(req);
      expect(correlationId.length).toBe(36);
    });

    it('mutates opts and initial req.headers when assigning', () => {
      const req = {headers: {}, method: 'GET'};
      const opts = {uri: 'some'};
      lib.assignCorrelationId(opts, req);
      expect(opts.headers['X-Correlation-ID'].length).toBe(36);
      expect(req.headers['x-correlation-id'].length).toBe(36);
    });
  });

  describe('explicit logging', () => {
    it('calls console functions', () => {
      spyOn(stub, 'info');
      spyOn(stub, 'error');
      spyOn(stub, 'warn');

      lib.info('hello', {a: 123});
      expect(stub.info).toHaveBeenCalledTimes(1);
      lib.debug({a: 123});
      expect(stub.info).toHaveBeenCalledTimes(2);
      lib.error('hello');
      expect(stub.error).toHaveBeenCalledTimes(1);
      lib.warn();
      expect(stub.warn).toHaveBeenCalledTimes(1);
    });

    it('exception set code anchor', done => {
      spyOn(stub, 'info').and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toBe('hello from an exception');
        expect(data.line).toBeDefined();
        expect(data.col).toBeDefined();
        expect(data.file).toBeDefined();
        done();
      });

      lib.info('hello', new Error('from an'), 'exception');
    });

    it('infoSource provides code position', done => {
      spyOn(stub, 'info').and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toBe('baz bar');
        expect(data.line).toBeDefined();
        expect(data.col).toBeDefined();
        expect(data.file).toBeDefined();
        done();
      });
      lib.infoSource('baz', 'bar');
    });

    it('reads correlationId when req is provided', done => {
      spyOn(stub, 'info').and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toBe('hello');
        expect(data.correlationId).toBe('foo-bar');
        done();
      });
      const req = {headers: {'x-correlation-id': 'foo-bar'}, method: 'GET'};
      lib.info(req, 'hello');
    });
  });

  describe('access log', () => {
    it('sets dash as a default username', done => {
      const app = express();
      app.use(lib.initAccessLog());
      app.get('/another', (req, res) => res.sendStatus(200));
      spyOn(stub, 'info').and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toMatch(/\-/);
        done();
      });
      supertest(app)
        .get('/another')
        .expect(200)
        .end(() => {});
    });

    it('calls info for a usual GET requst', done => {
      const app = express();
      app.use(lib.initAccessLog());
      app.get('/', (req, res) => res.sendStatus(403));
      spyOn(stub, 'info').and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.processTime).toBeDefined();
        expect(data.message).toMatch(/403/);
        expect(data.message).toMatch(/foo/);
        done();
      });
      supertest(app)
        .get('/')
        .auth('foo', 'bar')
        .end(() => {});
    });

    it('can be used from error handler', done => {
      const app = express();
      app.use(lib.initAccessLog());
      app.get('/another', (req, res, next) => {
        next(new Error('something happened'));
      });
      app.use((err, req, res, next) => { // eslint-disable-line
        lib.error(req, err);
      });
      spyOn(stub, 'error').and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toMatch(/something happened/);
        done();
      });
      supertest(app)
        .get('/another')
        .end(() => {});
    });
  });

  describe('repalcing transformer', () => {
    it('is possible', () => {
      spyOn(stub, 'info');
      const originalTransformer = lib.transformEntry;
      lib.transformEntry = entry => entry.message + '!';
      lib.info('hello');
      lib.transformEntry = originalTransformer;
      expect(stub.info).toHaveBeenCalledWith('hello!');
    });
  });
});
