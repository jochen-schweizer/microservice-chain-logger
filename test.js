/* eslint-env jasmine */

const lib = require('./index');
const stub = {};

function createSpies() {
  Object.assign(stub, {
    info: jasmine.createSpy(),
    warn: jasmine.createSpy(),
    debug: jasmine.createSpy(),
    error: jasmine.createSpy()
  });
  Object.assign(lib.logFunctions, stub);
}

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
      createSpies();
      lib.info('hello', {a: 123});
      expect(stub.info).toHaveBeenCalledTimes(1);
      lib.info({a: 123});
      expect(stub.info).toHaveBeenCalledTimes(2);
      lib.debug({a: 123});
      expect(stub.debug).toHaveBeenCalledTimes(1);
      lib.error('hello');
      expect(stub.error).toHaveBeenCalledTimes(1);
      lib.warn();
      expect(stub.warn).toHaveBeenCalledTimes(1);
    });

    it('sets stack and code anchor for exceptions', done => {
      createSpies();
      stub.error.and.callFake(message => {
        expect(stub.error).toHaveBeenCalledTimes(1);
        expect(message).toMatch(/test.js/m);
        done();
      });
      lib.error('some error', new Error('happened'));
    });

    it('processes unexpectedly formatted stacks', done => {
      spyOn(lib, 'transformEntry').and.callFake(lib.jsonTransformer);
      createSpies();
      stub.error.and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toMatch(/dummy/m);
        done();
      });
      const error = new Error('dummy');
      error.stack = 'some\ncustom\strange\nstack\ntrace';
      lib.error(error);
    });

    it('parses stack line without brackets ', done => {
      spyOn(lib, 'transformEntry').and.callFake(lib.jsonTransformer);
      createSpies();
      stub.error.and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.line).toBe(69);
        expect(data.column).toBe(13);
        expect(data.file).toBe('/app/some/super_file.js');
        expect(data.message).toMatch(/dummy/m);
        done();
      });
      const error = new Error('dummy');
      error.stack = 'some\n    at /app/some/super_file.js:69:13\nwhatever';
      lib.error(error);
    });

    it('clips message in jsonTransformer when too long', done => {
      const oldMaxLength = lib.maxMessageLength;
      lib.maxMessageLength = 7;
      spyOn(lib, 'transformEntry').and.callFake(lib.jsonTransformer);
      createSpies();
      stub.info.and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toBe('1234567');
        lib.maxMessageLength = oldMaxLength;
        done();
      });
      lib.info('1234567890');
    });

    it('edge case: do not clip message when message is an object', done => {
      const oldMaxLength = lib.maxMessageLength;
      lib.maxMessageLength = 7;
      const jsonContent = lib.jsonTransformer(undefined, {message: {complicated: '12345689'}});
      const data = JSON.parse(jsonContent);
      expect(data.message).toEqual({complicated: '12345689'});
      lib.maxMessageLength = oldMaxLength;
      done();
    });

    it('exception sets code anchor', done => {
      spyOn(lib, 'transformEntry').and.callFake(lib.jsonTransformer);
      createSpies();
      stub.info.and.callFake(jsonContent => {
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
      createSpies();
      stub.info.and.callFake(message => {
        expect(message).toMatch(/baz bar/);
        expect(message).toMatch(/in.*test.js:\d+:\d+/);
        done();
      });
      lib.infoSource('baz', 'bar');
    });

    it('reads correlationId when req is provided', done => {
      spyOn(lib, 'transformEntry').and.callFake(lib.jsonTransformer);
      createSpies();
      stub.info.and.callFake(jsonContent => {
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
      createSpies();
      stub.info.and.callFake(message => {
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
      createSpies();
      stub.info.and.callFake(message => {
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
      createSpies();
      stub.error.and.callFake(jsonContent => {
        const data = JSON.parse(jsonContent);
        expect(data.message).toMatch(/something happened/);
        lib.transformEntry = original;
        done();
      });
      supertest(app)
        .get('/another')
        .end(() => {});
    });

    it('injects logger into request', done => {
      const app = express();
      createSpies();
      app.use(lib.initAccessLog({injectIntoReq: true}));
      app.get('/', (req, res) => {
        req.logger.error('some error');
        res.sendStatus(200);
      });
      stub.error.and.callFake(message => {
        expect(message).toMatch(/some error.*the_id/);
        stub.info.and.callFake(done);
      });
      supertest(app)
        .get('/')
        .set('X-Correlation-ID', 'the_id')
        .end(() => {});
    });

    it('automatic assignCorrelationId', done => {
      const app = express();
      app.use(lib.initAccessLog({assignCorrelationId: true}));
      app.get('/', (req, res) => res.sendStatus(200));
      stub.info.and.callFake(message => {
        expect(message).toMatch(/\(c:/);
        done();
      });
      supertest(app)
        .get('/')
        .end(() => {});
    });
  });

  describe('replacing transformer', () => {
    it('is possible', () => {
      createSpies();
      const originalTransformer = lib.transformEntry;
      lib.transformEntry = (func, entry) => entry.message + '!';
      lib.info('hello');
      lib.transformEntry = originalTransformer;
      expect(stub.info).toHaveBeenCalledWith('hello!');
    });

    it('can be used for filtering', () => {
      createSpies();
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
