/**
 * Test Plan Section 13: CookieJar functionality
 * Comprehensive tests for cookie parsing, storage, and HTTP integration
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CookieJar } from '../src/CookieJar.js';
import { CollectionRunner } from '../src/CollectionRunner.js';
import { mockOptionsPlugin, MockHttpServer } from './test-helpers.js';
import type { Collection } from '@apiquest/types';

describe('Section 13: CookieJar', () => {

    // ========================================================================
    // Section 13.1: CookieJar Unit Tests
    // ========================================================================

    describe('13.1 Cookie Parsing and Storage', () => {
        let jar: CookieJar;

        beforeEach(() => {
            jar = new CookieJar({ persist: true });
        });

        test('Parse and store single Set-Cookie header', () => {
            jar.store('sessionId=abc123; Path=/; HttpOnly', 'http://localhost/');

            expect(jar.get('sessionId')).toBe('abc123');
            expect(jar.has('sessionId')).toBe(true);
        });

        test('Parse and store multiple Set-Cookie headers', () => {
            jar.store([
                'session=abc',
                'user=john',
                'theme=dark'
            ], 'http://localhost/');

            expect(jar.get('session')).toBe('abc');
            expect(jar.get('user')).toBe('john');
            expect(jar.get('theme')).toBe('dark');
        });

        test('Parse cookie with all attributes', () => {
            // Test cookie with multiple attributes (no Secure on http)
            jar.store('token=xyz789; Path=/; Expires=Wed, 11 Oct 2100 07:28:00 GMT; HttpOnly; SameSite=Lax', 'http://localhost/');

            expect(jar.get('token')).toBe('xyz789');
            expect(jar.has('token')).toBe(true);
        });

        test('Get non-existent cookie returns null', () => {
            expect(jar.get('nonexistent')).toBeNull();
        });

        test('Has cookie returns correct boolean', () => {
            jar.store('test=value', 'http://localhost/');

            expect(jar.has('test')).toBe(true);
            expect(jar.has('missing')).toBe(false);
        });

        test('Remove cookie', () => {
            jar.store('temp=value', 'http://localhost/');
            expect(jar.has('temp')).toBe(true);

            jar.remove('temp');
            expect(jar.has('temp')).toBe(false);
            expect(jar.get('temp')).toBeNull();
        });

        test('Clear all cookies', () => {
            jar.store(['cookie1=value1', 'cookie2=value2', 'cookie3=value3'], 'http://localhost/');

            expect(jar.toObject()).toHaveProperty('cookie1');
            expect(jar.toObject()).toHaveProperty('cookie2');

            jar.clear();

            expect(Object.keys(jar.toObject()).length).toBe(0);
            expect(jar.has('cookie1')).toBe(false);
        });

        test('toObject returns all cookies', () => {
            jar.store(['a=1', 'b=2', 'c=3'], 'http://localhost/');

            const cookies = jar.toObject();
            expect(cookies).toEqual({ a: '1', b: '2', c: '3' });
        });

        test('Expired cookie not returned (Max-Age)', async () => {
            // Set cookie that expires in 1 second
            jar.store('expired=value; Max-Age=1', 'http://localhost/');

            // Cookie should exist initially
            expect(jar.get('expired')).toBe('value');

            // Wait 1500ms for expiration (1 second + buffer)
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Should not be returned after expiration
            expect(jar.get('expired')).toBeNull();
        }, 10000); // 10 second timeout for this test

        test('Expired cookie not returned (Expires)', () => {
            // Set cookie with past expiration date
            jar.store('old=value; Expires=Wed, 01 Jan 2020 00:00:00 GMT', 'http://localhost/');

            expect(jar.get('old')).toBeNull();
        });
    });

    describe('13.2 Domain and Path Matching', () => {
        let jar: CookieJar;

        beforeEach(() => {
            jar = new CookieJar({ persist: true });
        });

        test('Domain matching - subdomain receives parent domain cookie', () => {
            // Store cookie for .example.com
            jar.store('shared=value; Domain=.example.com', 'https://example.com/');

            // Should be sent to subdomain
            const header = jar.getCookieHeader('https://sub.example.com/page');
            expect(header).toContain('shared=value');
        });

        test('Path matching - cookie sent to matching path', () => {
            jar.store('api_cookie=value; Path=/api', 'https://example.com/api');

            // Should be sent to /api and subpaths
            expect(jar.getCookieHeader('https://example.com/api')).toContain('api_cookie=value');
            expect(jar.getCookieHeader('https://example.com/api/users')).toContain('api_cookie=value');

            // Should NOT be sent to different path
            expect(jar.getCookieHeader('https://example.com/other')).toBeNull();
        });

        test('getCookieHeader returns correct format', () => {
            jar.store(['cookie1=value1', 'cookie2=value2'], 'http://localhost/');

            const header = jar.getCookieHeader('http://localhost/');

            // Should be in "name1=value1; name2=value2" format
            expect(header).toContain('cookie1=value1');
            expect(header).toContain('cookie2=value2');
            expect(header).toMatch(/cookie1=value1;\s*cookie2=value2|cookie2=value2;\s*cookie1=value1/);
        });
    });

    // ========================================================================
    // Section 13.3: HTTP Plugin Integration Tests
    // ========================================================================

    describe('13.3 HTTP Plugin Integration', () => {
        let server: MockHttpServer;
        let baseUrl: string;
        let runner: CollectionRunner;

        beforeEach(async () => {
            server = new MockHttpServer();

            // Route: Set cookies
            server.on('GET', '/set-cookies', (req, res) => {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Set-Cookie': [
                        'sessionId=abc123; Path=/',
                        'userId=user456; Path=/; HttpOnly'
                    ]
                });
                res.end(JSON.stringify({ message: 'Cookies set' }));
            });

            // Route: Echo cookies back
            server.on('GET', '/echo-cookies', (req, res) => {
                const cookies = req.headers.cookie ?? '';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ cookies }));
            });

            // Route: Set cookie with attributes
            server.on('GET', '/set-cookie-attributes', (req, res) => {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Set-Cookie': 'token=xyz789; Path=/api; Secure; HttpOnly; SameSite=Strict'
                });
                res.end(JSON.stringify({ message: 'Cookie with attributes set' }));
            });

            // Route: Set cookie for /api path
            server.on('GET', '/api/set', (req, res) => {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Set-Cookie': 'api_token=secret; Path=/api'
                });
                res.end(JSON.stringify({ message: 'API cookie set' }));
            });

            // Route: Check API cookie
            server.on('GET', '/api/check', (req, res) => {
                const cookies = req.headers.cookie ?? '';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ hasCookie: cookies.includes('api_token') }));
            });

            // Route: Check cookie on different path
            server.on('GET', '/other/check', (req, res) => {
                const cookies = req.headers.cookie ?? '';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ hasCookie: cookies.includes('api_token') }));
            });

            // Route: Error response with Set-Cookie
            server.on('GET', '/error-with-cookie', (req, res) => {
                res.writeHead(401, {
                    'Content-Type': 'application/json',
                    'Set-Cookie': 'error_cookie=error_value'
                });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
            });

            baseUrl = await server.start();

            runner = new CollectionRunner();
            runner.registerPlugin(mockOptionsPlugin);
        });

        afterEach(async () => {
            await server.stop();
        });

        test('Server sends Set-Cookie → HTTP plugin stores in jar', async () => {
          const collection: Collection = {
            info: { id: 'test', name: 'Test' },
            protocol: 'mock-options',
            items: [
                    {
                        type: 'request',
                        id: 'req1',
                        name: 'Set Cookies',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/set-cookies`
                        },
                        postRequestScript: `
              quest.test('sessionId cookie stored', () => {
                expect(quest.cookies.has('sessionId')).to.be.true;
              });
              quest.test('userId cookie stored', () => {
                expect(quest.cookies.has('userId')).to.be.true;
              });
              quest.test('sessionId value correct', () => {
                expect(quest.cookies.get('sessionId')).to.equal('abc123');
              });
            `
                    }
                ]
            };

            const result = await runner.run(collection, { jar: { persist: true } });

            expect(result.passedTests).toBe(3);
            expect(result.failedTests).toBe(0);
        });

        test('Second request → HTTP plugin sends Cookie header', async () => {
          const collection: Collection = {
            info: { id: 'test', name: 'Test' },
            protocol: 'mock-options',
            items: [
                    {
                        type: 'request',
                        id: 'req1',
                        name: 'Set Cookies',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/set-cookies`
                        }
                    },
                    {
                        type: 'request',
                        id: 'req2',
                        name: 'Echo Cookies',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/echo-cookies`
                        },
                        postRequestScript: `
              quest.test('sessionId sent in Cookie header', () => {
                const body = JSON.parse(quest.response.body);
                expect(body.cookies).to.include('sessionId=abc123');
              });
              quest.test('userId sent in Cookie header', () => {
                const body = JSON.parse(quest.response.body);
                expect(body.cookies).to.include('userId=user456');
              });
            `
                    }
                ]
            };

            const result = await runner.run(collection, { jar: { persist: true } });

            expect(result.passedTests).toBe(2);
            expect(result.failedTests).toBe(0);
        });

        test('persist:true → cookies maintained across multiple requests', async () => {
          const collection: Collection = {
            info: { id: 'test', name: 'Test' },
            protocol: 'mock-options',
            items: [
                    {
                        type: 'request',
                        id: 'req1',
                        name: 'Set Cookies',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/set-cookies`
                        }
                    },
                    {
                        type: 'request',
                        id: 'req2',
                        name: 'Check 1',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/echo-cookies`
                        },
                        postRequestScript: `
              quest.test('Cookies present', () => {
                const body = JSON.parse(quest.response.body);
                expect(body.cookies).to.include('sessionId');
              });
            `
                    },
                    {
                        type: 'request',
                        id: 'req3',
                        name: 'Check 2',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/echo-cookies`
                        },
                        postRequestScript: `
              quest.test('Cookies still present', () => {
                const body = JSON.parse(quest.response.body);
                expect(body.cookies).to.include('sessionId');
              });
            `
                    }
                ]
            };

            const result = await runner.run(collection, { jar: { persist: true } });

            expect(result.passedTests).toBe(2);
            expect(result.failedTests).toBe(0);
        });

        test('persist:false → cookies cleared between requests', async () => {
          const collection: Collection = {
            info: { id: 'test', name: 'Test' },
            protocol: 'mock-options',
            items: [
                    {
                        type: 'request',
                        id: 'req1',
                        name: 'Set Cookies',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/set-cookies`
                        }
                    },
                    {
                        type: 'request',
                        id: 'req2',
                        name: 'Check Cookies',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/echo-cookies`
                        },
                        postRequestScript: `
              quest.test('No cookies sent', () => {
                const body = JSON.parse(quest.response.body);
                expect(body.cookies).to.equal('');
              });
            `
                    }
                ]
            };

            const result = await runner.run(collection, { jar: { persist: false } });

            expect(result.passedTests).toBe(1);
            expect(result.failedTests).toBe(0);
        });

        test('Cookies sent only to matching path', async () => {
            const collection: Collection = {
                info: { id: 'test', name: 'Test' },
                protocol: 'mock-options',
                items: [
                    {
                        type: 'request',
                        id: 'req1',
                        name: 'Set API Cookie',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/api/set`
                        }
                    },
                    {
                        type: 'request',
                        id: 'req2',
                        name: 'Check API Path',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/api/check`
                        },
                        postRequestScript: `
              quest.test('Cookie sent to /api path', () => {
                const body = JSON.parse(quest.response.body);
                expect(body.hasCookie).to.be.true;
              });
            `
                    },
                    {
                        type: 'request',
                        id: 'req3',
                        name: 'Check Other Path',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/other/check`
                        },
                        postRequestScript: `
              quest.test('Cookie NOT sent to /other path', () => {
                const body = JSON.parse(quest.response.body);
                expect(body.hasCookie).to.be.false;
              });
            `
                    }
                ]
            };

            const result = await runner.run(collection, { jar: { persist: true } });

            expect(result.passedTests).toBe(2);
            expect(result.failedTests).toBe(0);
        });

        test('Multiple Set-Cookie headers in single response → all stored', async () => {
          const collection: Collection = {
            info: { id: 'test', name: 'Test' },
            protocol: 'mock-options',
            items: [
                    {
                        type: 'request',
                        id: 'req1',
                        name: 'Set Multiple Cookies',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/set-cookies`
                        },
                        postRequestScript: `
              quest.test('sessionId stored', () => {
                expect(quest.cookies.has('sessionId')).to.be.true;
              });
              quest.test('userId stored', () => {
                expect(quest.cookies.has('userId')).to.be.true;
              });
            `
                    }
                ]
            };

            const result = await runner.run(collection, { jar: { persist: true } });

            expect(result.passedTests).toBe(2);
            expect(result.failedTests).toBe(0);
        });

        test('Error response with Set-Cookie → cookies still stored', async () => {
          const collection: Collection = {
            info: { id: 'test', name: 'Test' },
            protocol: 'mock-options',
            items: [
                    {
                        type: 'request',
                        id: 'req1',
                        name: 'Error with Cookie',
                        data: {
                            method: 'GET',
                            url: `${baseUrl}/error-with-cookie`
                        },
                        postRequestScript: `
              quest.test('Response status is 401', () => {
                expect(quest.response.status).to.equal(401);
              });
              quest.test('error_cookie stored', () => {
                expect(quest.cookies.has('error_cookie')).to.be.true;
              });
              quest.test('error_cookie value correct', () => {
                expect(quest.cookies.get('error_cookie')).to.equal('error_value');
              });
            `
                    }
                ]
            };

            const result = await runner.run(collection, { jar: { persist: true } });

            expect(result.passedTests).toBe(3);
            expect(result.failedTests).toBe(0);
        });
    });
});



