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
    describe('getCorrelationId()', () => {
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

      it('throws on bad req', () => {
        expect(() => lib.getCorrelationId('bad')).toThrow();
      });
    });


    describe('assignCorrelationId()', () => {
      it('can be called without opts', () => {
        const req = {headers: {}, method: 'GET'};
        lib.assignCorrelationId(req);
        expect(req.headers['x-correlation-id'].length).toBe(36);
      });

      it('mutates opts and initial req.headers when assigning', () => {
        const req = {headers: {}, method: 'GET'};
        const opts = {uri: 'some'};
        lib.assignCorrelationId(req, opts);
        expect(opts.headers['X-Correlation-ID'].length).toBe(36);
        expect(req.headers['x-correlation-id'].length).toBe(36);
      });

      it('accepts string opts', () => {
        const req = {headers: {'x-correlation-id': 'zzz'}, method: 'GET'};
        const opts = lib.assignCorrelationId(req, 'http://example.com');
        expect(opts.headers['X-Correlation-ID']).toBe('zzz');
      });

      it('throws on bad req', () => {
        expect(() => {
          lib.assignCorrelationId(null, {});
        }).toThrow();
      });

      it('throws on empty opts', () => {
        expect(() => {
          lib.assignCorrelationId({headers: {}}, null);
        }).toThrow();
      });
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

    it('sets stack and code anchor for exceptions', done => {
      spyOn(stub, 'error').and.callFake(message => {
        expect(stub.error).toHaveBeenCalledTimes(1);
        expect(message).toMatch(/test.js/m);
        done();
      });
      lib.error('some error', new Error('happened'));
    });

    it('exception sets code anchor', done => {
      spyOn(lib, 'transformEntry').and.callFake(lib.jsonTransformer);
      spyOn(stub, 'info').and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toBe('hello from a\n\n\nmultiline exception');
        expect(data.line).toBeDefined();
        expect(data.column).toBeDefined();
        expect(data.file).toBeDefined();
        done();
      });

      lib.info('hello', new Error('from a\n\n\nmultiline'), 'exception');
    });

    it('infoSource provides code position', done => {
      spyOn(stub, 'info').and.callFake(message => {
        expect(message).toMatch(/baz bar/);
        expect(message).toMatch(/in.*test.js:\d+:\d+/);
        done();
      });
      lib.infoSource('baz', 'bar');
    });

    it('reads correlationId when req is provided', done => {
      spyOn(lib, 'transformEntry').and.callFake(lib.jsonTransformer);
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
      spyOn(stub, 'info').and.callFake(message => {
        expect(message).toMatch(/\-/);
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
      spyOn(stub, 'info').and.callFake(message => {
        expect(message).toMatch(/403/);
        expect(message).toMatch(/foo/);
        done();
      });
      supertest(app)
        .get('/')
        .auth('foo', 'bar')
        .end(() => {});
    });

    it('can be initialized with jsonTransformer', done => {
      const app = express();
      const original = lib.transformEntry;
      app.use(lib.initAccessLog({
        useTextTransformer: false
      }));
      app.get('/another', (req, res, next) => {
        next(new Error('something happened'));
      });
      app.use((err, req, res, next) => { // eslint-disable-line
        lib.error(req, err);
      });
      spyOn(stub, 'error').and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toMatch(/something happened/);
        lib.transformEntry = original;
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
      lib.transformEntry = (func, entry) => entry.message + '!';
      lib.info('hello');
      lib.transformEntry = originalTransformer;
      expect(stub.info).toHaveBeenCalledWith('hello!');
    });

    it('can be used for filtering', () => {
      spyOn(stub, 'info');
      spyOn(stub, 'error');
      const originalTransformer = lib.transformEntry;
      function filter(func, entry) {
        if (func === stub.info) {
          return;
        }
        return originalTransformer(func, entry);
      }

      lib.transformEntry = filter;
      lib.info('hello');
      lib.error('hello');
      lib.transformEntry = originalTransformer;
      expect(stub.info).not.toHaveBeenCalled();
      expect(stub.error).toHaveBeenCalled();
    });
  });

  describe('textTransformer()', () => {
    it('generates text message', () => {
      const message = lib.textTransformer(stub.info, {
        processTime: (new Date()).toISOString(),
        message: 'foo'
      });
      expect(message).toMatch(/foo/);
      expect(message).toMatch(/Z/);
    });

    it('adds ERR prefix', () => {
      const message = lib.textTransformer(stub.error, {
        processTime: (new Date()).toISOString(),
        message: 'foo'
      });
      expect(message).toMatch(/ERR: foo/);
    });

    it('adds correlationId suffix', () => {
      const message = lib.textTransformer(stub.info, {
        processTime: (new Date()).toISOString(),
        correlationId: '12345',
        message: 'foo'
      });
      expect(message).toMatch(/\(c:12345\)/);
    });
  });
});
