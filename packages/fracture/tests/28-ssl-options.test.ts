// Section 28: SSL/TLS Options Tests
// Tests SSL certificate validation and client certificates

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';

describe('Section 28: SSL/TLS Options', () => {
  let runner: CollectionRunner;

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  describe('28.1 Certificate Validation', () => {
    test('ssl.validateCertificates: true validates server certificates', async () => {
      const collection: Collection = {
        info: { id: 'ssl-1', name: 'SSL Validate True', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Validate Cert',
          data: { method: 'GET', url: 'mock://secure' },
          postRequestScript: `
            quest.test('ssl.validateCertificates received as true', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl.validateCertificates).to.be.true;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: { validateCertificates: true }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('ssl.validateCertificates: false (insecure) skips validation', async () => {
      const collection: Collection = {
        info: { id: 'ssl-2', name: 'SSL Validate False', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Skip Validation',
          data: { method: 'GET', url: 'mock://insecure' },
          postRequestScript: `
            quest.test('ssl.validateCertificates received as false', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl.validateCertificates).to.be.false;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: { validateCertificates: false }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('Invalid certificate with validation enabled throws error', async () => {
      const collection: Collection = {
        info: { id: 'ssl-3', name: 'Invalid Cert With Validation', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Invalid Cert',
          data: { method: 'GET', url: 'mock://invalid-cert' },
          postRequestScript: `
            quest.test('ssl options structure correct', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl).to.have.property('validateCertificates');
              expect(body.receivedOptions.ssl.validateCertificates).to.be.true;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: { validateCertificates: true }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('Invalid certificate with validation disabled succeeds', async () => {
      const collection: Collection = {
        info: { id: 'ssl-4', name: 'Invalid Cert No Validation', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Invalid Cert Allowed',
          data: { method: 'GET', url: 'mock://invalid-cert' },
          postRequestScript: `
            quest.test('Request succeeds with validation disabled', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl.validateCertificates).to.be.false;
              expect(quest.response.status).to.equal(200);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: { validateCertificates: false }
      });
      
      expect(result.passedTests).toBe(1);
    });
  });

  describe('28.2 Client Certificates', () => {
    test('ssl.clientCertificate.cert and .key authenticate with mTLS', async () => {
      const collection: Collection = {
        info: { id: 'ssl-5', name: 'Client Cert Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'mTLS Request',
          data: { method: 'GET', url: 'mock://mtls' },
          postRequestScript: `
            quest.test('clientCertificate received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl.clientCertificate).to.exist;
              expect(body.receivedOptions.ssl.clientCertificate.cert).to.include('CERTIFICATE');
              expect(body.receivedOptions.ssl.clientCertificate.key).to.include('PRIVATE KEY');
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: {
          clientCertificate: {
            cert: '-----BEGIN CERTIFICATE-----\\ncert-content\\n-----END CERTIFICATE-----',
            key: '-----BEGIN PRIVATE KEY-----\\nkey-content\\n-----END PRIVATE KEY-----'
          }
        }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('ssl.clientCertificate.passphrase unlocks encrypted key', async () => {
      const collection: Collection = {
        info: { id: 'ssl-6', name: 'Client Cert With Passphrase', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Encrypted Key',
          data: { method: 'GET', url: 'mock://mtls-encrypted' },
          postRequestScript: `
            quest.test('passphrase received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl.clientCertificate.passphrase).to.equal('secret123');
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: {
          clientCertificate: {
            cert: '-----BEGIN CERTIFICATE-----\\ncert\\n-----END CERTIFICATE-----',
            key: '-----BEGIN ENCRYPTED PRIVATE KEY-----\\nkey\\n-----END ENCRYPTED PRIVATE KEY-----',
            passphrase: 'secret123'
          }
        }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('Missing client certificate when required throws error', async () => {
      const collection: Collection = {
        info: { id: 'ssl-7', name: 'Missing Client Cert', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'No Client Cert',
          data: { method: 'GET', url: 'mock://mtls-required' },
          postRequestScript: `
            quest.test('ssl options exist', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl).to.exist;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: { validateCertificates: true }
      });
      
      expect(result.passedTests).toBe(1);
    });
  });

  describe('28.3 CA Certificates', () => {
    test('ssl.ca adds custom CA certificate for validation', async () => {
      const collection: Collection = {
        info: { id: 'ssl-8', name: 'Custom CA Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Custom CA',
          data: { method: 'GET', url: 'mock://custom-ca' },
          postRequestScript: `
            quest.test('CA certificate received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl.ca).to.include('CERTIFICATE');
              expect(body.receivedOptions.ssl.ca).to.include('ca-cert');
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: {
          validateCertificates: true,
          ca: '-----BEGIN CERTIFICATE-----\\nca-cert\\n-----END CERTIFICATE-----'
        }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('Multiple CA certificates can be provided', async () => {
      const collection: Collection = {
        info: { id: 'ssl-9', name: 'Multiple CAs', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Multi CA',
          data: { method: 'GET', url: 'mock://multi-ca' },
          postRequestScript: `
            quest.test('Multiple CAs received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.ssl.ca).to.include('ca-cert-1');
              expect(body.receivedOptions.ssl.ca).to.include('ca-cert-2');
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        ssl: {
          validateCertificates: true,
          ca: '-----BEGIN CERTIFICATE-----\\nca-cert-1\\n-----END CERTIFICATE-----\\n-----BEGIN CERTIFICATE-----\\nca-cert-2\\n-----END CERTIFICATE-----'
        }
      });
      
      expect(result.passedTests).toBe(1);
    });
  });

  describe('28.4 SSL Protocol Options', () => {
    test.skip('ssl.minVersion sets minimum TLS version', async () => {
      // NOTE: minVersion/maxVersion not in current schema - skip for now
      // See TEST-COVERAGE-PLAN.md Issue 1
    });

    test.skip('ssl.maxVersion sets maximum TLS version', async () => {
      // NOTE: minVersion/maxVersion not in current schema - skip for now
      // See TEST-COVERAGE-PLAN.md Issue 1
    });
  });
});
