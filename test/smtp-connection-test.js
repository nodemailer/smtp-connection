/* eslint no-unused-expressions:0, no-invalid-this:0 */
/* globals afterEach, beforeEach, describe, it */

'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var fs = require('fs');
var chai = require('chai');
var expect = chai.expect;
var SMTPConnection = require('../lib/smtp-connection');
var packageData = require('../package.json');
var SMTPServer = require('smtp-server').SMTPServer;
var HttpConnectProxy = require('proxy-test-server');
var net = require('net');
var xoauth2Server = require('./xoauth2-mock-server');
var xoauth2 = require('xoauth2');
var sinon = require('sinon');

chai.config.includeStack = true;

var PORT_NUMBER = 8397;
var PROXY_PORT_NUMBER = 9999;
var XOAUTH_PORT = 8497;

describe('Version test', function () {
    it('Should expose version number', function () {
        var client = new SMTPConnection();
        expect(client.version).to.equal(packageData.version);
    });
});

describe('Connection tests', function () {
    var server, insecureServer, invalidServer, secureServer, httpProxy;

    beforeEach(function (done) {
        server = new SMTPServer({
            onAuth: function (auth, session, callback) {
                if (auth.username !== 'testuser' || auth.password !== 'testpass') {
                    return callback(new Error('Invalid username or password'));
                }
                callback(null, {
                    user: 123
                });
            },
            onData: function (stream, session, callback) {
                stream.on('data', function () {});
                stream.on('end', callback);
            },
            logger: false
        });

        insecureServer = new SMTPServer({
            disabledCommands: ['STARTTLS', 'AUTH'],
            onData: function (stream, session, callback) {
                stream.on('data', function () {});
                stream.on('end', callback);
            },
            logger: false
        });

        invalidServer = net.createServer(function () {});

        secureServer = new SMTPServer({
            secure: true,
            onAuth: function (auth, session, callback) {
                if (auth.username !== 'testuser' || auth.password !== 'testpass') {
                    return callback(new Error('Invalid username or password'));
                }
                callback(null, {
                    user: 123
                });
            },
            onData: function (stream, session, callback) {
                stream.on('data', function () {});
                stream.on('end', callback);
            },
            logger: false
        });

        httpProxy = new HttpConnectProxy();

        server.listen(PORT_NUMBER, function () {
            invalidServer.listen(PORT_NUMBER + 1, function () {
                secureServer.listen(PORT_NUMBER + 2, function () {
                    insecureServer.listen(PORT_NUMBER + 3, function () {
                        httpProxy.listen(PROXY_PORT_NUMBER, done);
                    });
                });
            });
        });
    });

    afterEach(function (done) {
        server.close(function () {
            invalidServer.close(function () {
                secureServer.close(function () {
                    insecureServer.close(function () {
                        httpProxy.close(done);
                    });
                });
            });
        });
    });

    it('should connect to unsecure server', function (done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER + 3,
            ignoreTLS: true,
            logger: false
        });

        client.connect(function () {
            expect(client.secure).to.be.false;
            client.close();
        });

        client.on('error', function (err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });

    it('should connect to a server and upgrade with STARTTLS', function (done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER,
            logger: false
        });

        client.connect(function () {
            expect(client.secure).to.be.true;
            client.close();
        });

        client.on('error', function (err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });

    it('should connect to a server and upgrade with forced STARTTLS', function (done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER,
            logger: false,
            requireTLS: true
        });

        client.connect(function () {
            expect(client.secure).to.be.true;
            client.close();
        });

        client.on('error', function (err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });

    it('should try upgrade with STARTTLS where not advertised', function (done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER + 3,
            requireTLS: true,
            logger: false
        });

        client.connect(function () {
            // should not run
            expect(false).to.be.true;
            client.close();
        });

        client.once('error', function (err) {
            expect(err).to.exist;
        });

        client.on('end', done);
    });

    it('should receive end after STARTTLS', function (done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER,
            logger: false
        });

        client.connect(function () {
            expect(client.secure).to.be.true;
            server.connections.forEach(function (conn) {
                conn.close();
            });
        });

        client.on('error', function (err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });

    it('should connect to a secure server', function (done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER + 2,
            secure: true,
            logger: false
        });

        client.connect(function () {
            expect(client.secure).to.be.true;
            client.close();
        });

        client.on('error', function (err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });

    it('should emit error for invalid port', function (done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER + 10,
            logger: false
        });

        client.connect(function () {
            // should not run
            expect(false).to.be.true;
            client.close();
        });

        client.once('error', function (err) {
            expect(err).to.exist;
        });

        client.on('end', done);
    });

    it('should emit error for too large port', function (done) {
        var client = new SMTPConnection({
            port: 999999999,
            logger: false
        });

        client.connect(function () {
            // should not run
            expect(false).to.be.true;
            client.close();
        });

        client.once('error', function (err) {
            expect(err).to.exist;
        });

        client.on('end', done);
    });

    it('should emit inactivity timeout error', function (done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER,
            socketTimeout: 100,
            logger: false
        });

        client.connect(function () {
            // do nothing
        });

        client.once('error', function (err) {
            expect(err).to.exist;
            expect(err.code).to.equal('ETIMEDOUT');
        });

        client.on('end', done);
    });

    it('should connect through proxy', function (done) {
        var runTest = function (socket) {
            var client = new SMTPConnection({
                logger: false,
                port: PORT_NUMBER,
                connection: socket
            });

            client.connect(function () {
                expect(client.secure).to.be.true;
                client.login({
                    user: 'testuser',
                    pass: 'testpass'
                }, function (err) {
                    expect(err).to.not.exist;
                    expect(client.authenticated).to.be.true;
                    client.close();
                });
            });

            client.on('error', function (err) {
                expect(err).to.not.exist;
            });

            client.on('end', done);
        };

        proxyConnect(PROXY_PORT_NUMBER, '127.0.0.1', PORT_NUMBER, '127.0.0.1', function (err, socket) {
            expect(err).to.not.exist;
            runTest(socket);
        });
    });

    it('should connect through proxy to secure server', function (done) {
        var runTest = function (socket) {
            var client = new SMTPConnection({
                logger: false,
                port: PORT_NUMBER + 2,
                secure: true,
                connection: socket
            });

            client.connect(function () {
                expect(client.secure).to.be.true;
                client.login({
                    user: 'testuser',
                    pass: 'testpass'
                }, function (err) {
                    expect(err).to.not.exist;
                    expect(client.authenticated).to.be.true;
                    client.close();
                });
            });

            client.on('error', function (err) {
                expect(err).to.not.exist;
            });

            client.on('end', done);
        };

        proxyConnect(PROXY_PORT_NUMBER, '127.0.0.1', PORT_NUMBER + 2, '127.0.0.1', function (err, socket) {
            expect(err).to.not.exist;
            runTest(socket);
        });
    });
});

describe('Login tests', function () {
    this.timeout(10 * 1000);

    var server, client, testtoken = 'testtoken';

    beforeEach(function (done) {
        server = new SMTPServer({
            authMethods: ['PLAIN', 'XOAUTH2'],
            disabledCommands: ['STARTTLS'],

            onData: function (stream, session, callback) {
                stream.on('data', function () {});
                stream.on('end', callback);
            },

            onAuth: function (auth, session, callback) {
                if (auth.method !== 'XOAUTH2') {
                    if (auth.username !== 'testuser' || auth.password !== 'testpass') {
                        return callback(new Error('Invalid username or password'));
                    }
                } else if (auth.username !== 'testuser' || auth.accessToken !== testtoken) {
                    return callback(null, {
                        data: {
                            status: '401',
                            schemes: 'bearer mac',
                            scope: 'my_smtp_access_scope_name'
                        }
                    });
                }
                callback(null, {
                    user: 123
                });
            },
            onMailFrom: function (address, session, callback) {
                if (!/@valid.sender/.test(address.address)) {
                    return callback(new Error('Only user@valid.sender is allowed to send mail'));
                }

                if (address.args.SMTPUTF8) {
                    session.smtpUtf8 = true;
                }

                if (/[\x80-\uFFFF]/.test(address.address) && !session.smtpUtf8) {
                    return callback(new Error('Trying to use Unicode address without declaring SMTPUTF8 first'));
                }

                return callback(); // Accept the address
            },
            onRcptTo: function (address, session, callback) {
                if (!/@valid.recipient/.test(address.address)) {
                    return callback(new Error('Only user@valid.recipient is allowed to receive mail'));
                }
                if (/[\x80-\uFFFF]/.test(address.address) && !session.smtpUtf8) {
                    return callback(new Error('Trying to use Unicode address without declaring SMTPUTF8 first'));
                }
                return callback(); // Accept the address
            },
            logger: false
        });

        client = new SMTPConnection({
            port: PORT_NUMBER,
            logger: false
        });

        server.listen(PORT_NUMBER, function () {
            client.connect(done);
        });
    });

    afterEach(function (done) {
        client.close();
        server.close(done);
    });

    it('should login', function (done) {
        expect(client.authenticated).to.be.false;
        client.login({
            user: 'testuser',
            pass: 'testpass'
        }, function (err) {
            expect(err).to.not.exist;
            expect(client.authenticated).to.be.true;
            done();
        });
    });

    it('should return error for invalid login', function (done) {
        expect(client.authenticated).to.be.false;
        client.login({
            user: 'testuser',
            pass: 'invalid'
        }, function (err) {
            expect(err).to.exist;
            expect(client.authenticated).to.be.false;
            expect(err.code).to.equal('EAUTH');
            expect(err.responseCode).to.equal(535);
            done();
        });
    });

    describe('xoauth2 login', function () {
        this.timeout(10 * 1000);
        var x2server;

        beforeEach(function (done) {
            x2server = xoauth2Server({
                port: XOAUTH_PORT,
                onUpdate: (function (username, accessToken) {
                    testtoken = accessToken;
                }).bind(this)
            });

            x2server.addUser('testuser', 'refresh-token');

            x2server.start(done);
        });

        afterEach(function (done) {
            x2server.stop(done);
        });

        it('should login with xoauth2 string', function (done) {
            expect(client.authenticated).to.be.false;
            client.login({
                user: 'testuser',
                xoauth2: testtoken
            }, function (err) {
                expect(err).to.not.exist;
                expect(client.authenticated).to.be.true;
                done();
            });
        });

        it('should return error for invalid xoauth2 string token', function (done) {
            expect(client.authenticated).to.be.false;
            client.login({
                user: 'testuser',
                xoauth2: 'invalid'
            }, function (err) {
                expect(err).to.exist;
                expect(client.authenticated).to.be.false;
                expect(err.code).to.equal('EAUTH');
                done();
            });
        });

        it('should login with xoauth2 object', function (done) {
            expect(client.authenticated).to.be.false;
            client.login({
                xoauth2: xoauth2.createXOAuth2Generator({
                    user: 'testuser',
                    clientId: '{Client ID}',
                    clientSecret: '{Client Secret}',
                    refreshToken: 'refresh-token',
                    accessToken: 'uuuuu',
                    accessUrl: 'http://localhost:' + XOAUTH_PORT
                })
            }, function (err) {
                expect(err).to.not.exist;
                expect(client.authenticated).to.be.true;
                done();
            });
        });

        it('should fail with xoauth2 object', function (done) {
            expect(client.authenticated).to.be.false;
            client.login({
                xoauth2: xoauth2.createXOAuth2Generator({
                    user: 'testuser',
                    clientId: '{Client ID}',
                    clientSecret: '{Client Secret}',
                    refreshToken: 'refrsesh-token',
                    accessToken: 'uuuuu',
                    accessUrl: 'http://localhost:' + XOAUTH_PORT
                })
            }, function (err) {
                expect(err).to.exist;
                expect(client.authenticated).to.be.false;
                done();
            });
        });

        it('should fail with invalid xoauth2 response', function (done) {
            expect(client.authenticated).to.be.false;

            var x2gen = xoauth2.createXOAuth2Generator({
                user: 'testuser',
                clientId: '{Client ID}',
                clientSecret: '{Client Secret}',
                refreshToken: 'refresh-token',
                accessToken: 'uuuuu',
                accessUrl: 'http://localhost:' + XOAUTH_PORT
            });

            sinon.stub(x2gen, 'generateToken').yields(null, 'dXNlcj10ZXN0dXNlcgFhdXRoPUJlYXJlciB1dXV1dQEB');

            client.login({
                xoauth2: x2gen
            }, function (err) {
                expect(err).to.exist;
                expect(client.authenticated).to.be.false;

                x2gen.generateToken.restore();
                done();
            });
        });

    });

    describe('Send messages', function () {
        beforeEach(function (done) {
            client.login({
                user: 'testuser',
                pass: 'testpass'
            }, function (err) {
                expect(err).to.not.exist;
                done();
            });
        });

        it('should send message', function (done) {
            client.send({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, 'test', function (err, info) {
                expect(err).to.not.exist;
                expect(info).to.deep.equal({
                    accepted: ['test@valid.recipient'],
                    rejected: [],
                    response: '250 OK: message queued'
                });
                done();
            });
        });

        it('should send only to valid recipients', function (done) {
            client.send({
                from: 'test@valid.sender',
                to: ['test1@valid.recipient', 'test2@invalid.recipient', 'test3@valid.recipient']
            }, 'test', function (err, info) {
                expect(err).to.not.exist;
                expect(info).to.deep.equal({
                    accepted: ['test1@valid.recipient', 'test3@valid.recipient'],
                    rejected: ['test2@invalid.recipient'],
                    response: '250 OK: message queued'
                });
                done();
            });
        });

        it('should send using SMTPUTF8', function (done) {
            client.send({
                from: 'test@valid.sender',
                to: ['test1@valid.recipient', 'test2@invalid.recipient', 'test3õ@valid.recipient']
            }, 'test', function (err, info) {
                expect(err).to.not.exist;
                expect(info).to.deep.equal({
                    accepted: ['test1@valid.recipient', 'test3õ@valid.recipient'],
                    rejected: ['test2@invalid.recipient'],
                    response: '250 OK: message queued'
                });
                done();
            });
        });

        it('should return error for invalidly formatted recipients', function (done) {
            client.send({
                from: 'test@valid.sender',
                to: ['test@valid.recipient', '"address\r\n with folding"@valid.recipient']
            }, 'test', function (err) {
                expect(/^Invalid recipient/.test(err.message)).to.be.true;
                done();
            });
        });

        it('should return error for no valid recipients', function (done) {
            client.send({
                from: 'test@valid.sender',
                to: ['test1@invalid.recipient', 'test2@invalid.recipient', 'test3@invalid.recipient']
            }, 'test', function (err) {
                expect(err).to.exist;
                done();
            });
        });

        it('should return error for invalid sender', function (done) {
            client.send({
                from: 'test@invalid.sender',
                to: 'test@valid.recipient'
            }, 'test', function (err) {
                expect(err).to.exist;
                done();
            });
        });

        it('should send message string', function (done) {
            var chunks = [],
                message = new Array(1024).join('teretere, vana kere\n');

            server.on('data', function (connection, chunk) {
                chunks.push(chunk);
            });

            server.removeAllListeners('dataReady');
            server.on('dataReady', function (connection, callback) {
                var body = Buffer.concat(chunks);
                expect(body.toString()).to.equal(message.trim().replace(/\n/g, '\r\n'));
                callback(null, 'ABC1');
            });

            client.send({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, message, function (err) {
                expect(err).to.not.exist;
                done();
            });
        });

        it('should send message buffer', function (done) {
            var chunks = [],
                message = new Buffer(new Array(1024).join('teretere, vana kere\n'));

            server.on('data', function (connection, chunk) {
                chunks.push(chunk);
            });

            server.removeAllListeners('dataReady');
            server.on('dataReady', function (connection, callback) {
                var body = Buffer.concat(chunks);
                expect(body.toString()).to.equal(message.toString().trim().replace(/\n/g, '\r\n'));
                callback(null, 'ABC1');
            });

            client.send({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, message, function (err) {
                expect(err).to.not.exist;
                done();
            });
        });

        it('should send message stream', function (done) {
            var chunks = [],
                fname = __dirname + '/../LICENSE',
                message = fs.readFileSync(fname, 'utf-8');

            server.on('data', function (connection, chunk) {
                chunks.push(chunk);
            });

            server.removeAllListeners('dataReady');
            server.on('dataReady', function (connection, callback) {
                var body = Buffer.concat(chunks);
                expect(body.toString()).to.equal(message.toString().trim().replace(/\n/g, '\r\n'));
                callback(null, 'ABC1');
            });

            client.send({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, fs.createReadStream(fname), function (err) {
                expect(err).to.not.exist;
                done();
            });
        });
    });
});


function proxyConnect(port, host, destinationPort, destinationHost, callback) {
    var socket = net.connect(port, host, function () {
        socket.write('CONNECT ' + destinationHost + ':' + destinationPort + ' HTTP/1.1\r\n\r\n');

        var headers = '';
        var onSocketData = function (chunk) {
            var match;
            var remainder;

            headers += chunk.toString('binary');
            if ((match = headers.match(/\r\n\r\n/))) {
                socket.removeListener('data', onSocketData);
                remainder = headers.substr(match.index + match[0].length);
                headers = headers.substr(0, match.index);
                if (remainder) {
                    socket.unshift(new Buffer(remainder, 'binary'));
                }
                // proxy connection is now established
                return callback(null, socket);
            }
        };
        socket.on('data', onSocketData);
    });

    socket.on('error', function (err) {
        expect(err).to.not.exist;
    });
}
