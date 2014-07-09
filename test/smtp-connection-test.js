'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var fs = require('fs');
var chai = require('chai');
var expect = chai.expect;
var SMTPConnection = require('../src/smtp-connection');
var packageData = require('../package.json');
var simplesmtp = require('simplesmtp');
chai.Assertion.includeStack = true;
var net = require('net');
var xoauth2Server = require('./xoauth2-mock-server');
var xoauth2 = require('xoauth2');
var sinon = require('sinon');

var PORT_NUMBER = 8397;
var XOAUTH_PORT = 8497;

describe('Version test', function() {
    it('Should expose version number', function() {
        var client = new SMTPConnection();
        expect(client.version).to.equal(packageData.version);
    });
});

describe('Connection tests', function() {
    var server, invalidServer, secureServer;

    beforeEach(function(done) {
        server = new simplesmtp.createServer({
            ignoreTLS: true,
            disableDNSValidation: true
        });

        invalidServer = net.createServer(function() {});

        secureServer = new simplesmtp.createServer({
            ignoreTLS: true,
            disableDNSValidation: true,
            secureConnection: true
        });

        server.on("dataReady", function(connection, callback) {
            callback(null, "ABC1");
        });

        secureServer.on("dataReady", function(connection, callback) {
            callback(null, "ABC1");
        });

        server.listen(PORT_NUMBER, function() {
            invalidServer.listen(PORT_NUMBER + 1, function() {
                secureServer.listen(PORT_NUMBER + 3, done);
            });
        });
    });

    afterEach(function(done) {
        server.end(function() {
            invalidServer.close(function() {
                secureServer.end(done);
            });
        });
    });

    it('should connect to unsecure server', function(done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER,
            ignoreTLS: true
        });

        client.connect(function() {
            expect(client._secureMode).to.be.false;
            client.close();
        });

        client.on('error', function(err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });

    it('should connect to unserver and upgrade with STARTTLS', function(done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER
        });

        client.connect(function() {
            expect(client._secureMode).to.be.true;
            client.close();
        });

        client.on('error', function(err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });

    it('should connect to a secure server', function(done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER + 3,
            ignoreTLS: true,
            secureConnection: true
        });

        client.connect(function() {
            expect(client._secureMode).to.be.true;
            client.close();
        });

        client.on('error', function(err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });

    it('should emit error for invalid port', function(done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER + 2
        });

        client.connect(function() {
            // should not run
            expect(false).to.be.true;
            client.close();
        });

        client.on('error', function(err) {
            expect(err).to.exist;
        });

        client.on('end', done);
    });

    it('should emit error for missing greeting', function(done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER + 1,
            greetingTimeout: 100
        });

        client.connect(function() {
            // should not run
            expect(false).to.be.true;
            client.close();
        });

        client.on('error', function(err) {
            expect(err).to.exist;
        });

        client.on('end', done);
    });

    it('should emit inactivity timeout error', function(done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER,
            socketTimeout: 100
        });

        client.connect(function() {
            // do nothing
        });

        client.on('error', function(err) {
            expect(err).to.exist;
        });

        client.on('end', done);
    });
});

describe('Login tests', function() {
    var server, client, testtoken = 'testtoken';

    beforeEach(function(done) {
        server = new simplesmtp.createServer({
            ignoreTLS: true,
            disableDNSValidation: true,
            enableAuthentication: true,
            debug: false,
            authMethods: ['PLAIN', 'XOAUTH2']
        });

        server.on('authorizeUser', function(connection, username, pass, callback) {
            callback(null, username === 'testuser' && (pass === 'testpass' || pass === testtoken));
        });

        server.on('validateSender', function(connection, email, callback) {
            callback(!/@valid.sender/.test(email) && new Error('Invalid sender'));
        });

        server.on('validateRecipient', function(connection, email, callback) {
            callback(!/@valid.recipient/.test(email) && new Error('Invalid recipient'));
        });

        server.on("dataReady", function(connection, callback) {
            callback(null, "ABC1");
        });

        client = new SMTPConnection({
            port: PORT_NUMBER
        });

        server.listen(PORT_NUMBER, function() {
            client.connect(done);
        });
    });

    afterEach(function(done) {
        client.close();
        server.end(done);
    });

    it('should login', function(done) {
        expect(client.authenticated).to.be.false;
        client.login({
            user: 'testuser',
            pass: 'testpass'
        }, function(err) {
            expect(err).to.not.exist;
            expect(client.authenticated).to.be.true;
            done();
        });
    });

    it('should return error for invalid login', function(done) {
        expect(client.authenticated).to.be.false;
        client.login({
            user: 'testuser',
            pass: 'invalid'
        }, function(err) {
            expect(err).to.exist;
            expect(client.authenticated).to.be.false;
            expect(err.code).to.equal('EAUTH');
            expect(err.responseCode).to.equal(535);
            expect(err.response).to.contain('535 5.7.8 Error');
            done();
        });
    });

    describe('xoauth2 login', function() {
        this.timeout(10 * 1000);
        var x2server;

        beforeEach(function(done) {
            x2server = xoauth2Server({
                port: XOAUTH_PORT,
                onUpdate: (function(username, accessToken) {
                    testtoken = accessToken;
                }).bind(this)
            });

            x2server.addUser('testuser', 'refresh-token');

            x2server.start(done);
        });

        afterEach(function(done) {
            x2server.stop(done);
        });

        it('should login with xoauth2 string', function(done) {
            expect(client.authenticated).to.be.false;
            client.login({
                user: 'testuser',
                xoauth2: testtoken
            }, function(err) {
                expect(err).to.not.exist;
                expect(client.authenticated).to.be.true;
                done();
            });
        });

        it('should return error for invalid xoauth2 string token', function(done) {
            expect(client.authenticated).to.be.false;
            client.login({
                user: 'testuser',
                xoauth2: 'invalid'
            }, function(err) {
                expect(err).to.exist;
                expect(client.authenticated).to.be.false;
                expect(err.code).to.equal('EAUTH');
                done();
            });
        });

        it('should login with xoauth2 object', function(done) {
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
            }, function(err) {
                expect(err).to.not.exist;
                expect(client.authenticated).to.be.true;
                done();
            });
        });

        it('should fail with xoauth2 object', function(done) {
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
            }, function(err) {
                expect(err).to.exist;
                expect(client.authenticated).to.be.false;
                done();
            });
        });

        it('should fail with invalid xoauth2 response', function(done) {
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
            }, function(err) {
                expect(err).to.exist;
                expect(client.authenticated).to.be.false;

                x2gen.generateToken.restore();
                done();
            });
        });

    });

    describe('Send messages', function() {
        beforeEach(function(done) {
            client.login({
                user: 'testuser',
                pass: 'testpass'
            }, function(err) {
                expect(err).to.not.exist;
                done();
            });
        });

        it('should send message', function(done) {
            client.send({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, 'test', function(err, info) {
                expect(err).to.not.exist;
                expect(info).to.deep.equal({
                    accepted: ['test@valid.recipient'],
                    rejected: [],
                    response: '250 2.0.0 Ok: queued as ABC1'
                });
                done();
            });
        });

        it('should send only to valid recipients', function(done) {
            client.send({
                from: 'test@valid.sender',
                to: ['test1@valid.recipient', 'test2@invalid.recipient', 'test3@valid.recipient']
            }, 'test', function(err, info) {
                expect(err).to.not.exist;
                expect(info).to.deep.equal({
                    accepted: ['test1@valid.recipient', 'test3@valid.recipient'],
                    rejected: ['test2@invalid.recipient'],
                    response: '250 2.0.0 Ok: queued as ABC1'
                });
                done();
            });
        });

        it('should return error for no valid recipients', function(done) {
            client.send({
                from: 'test@valid.sender',
                to: ['test1@invalid.recipient', 'test2@invalid.recipient', 'test3@invalid.recipient']
            }, 'test', function(err) {
                expect(err).to.exist;
                done();
            });
        });

        it('should return error for invalid sender', function(done) {
            client.send({
                from: 'test@invalid.sender',
                to: 'test@valid.recipient'
            }, 'test', function(err) {
                expect(err).to.exist;
                done();
            });
        });

        it('should send message string', function(done) {
            var chunks = [],
                message = new Array(1024).join('teretere, vana kere\n');

            server.on('data', function(connection, chunk) {
                chunks.push(chunk);
            });

            server.removeAllListeners('dataReady');
            server.on('dataReady', function(connection, callback) {
                var body = Buffer.concat(chunks);
                expect(body.toString()).to.equal(message.trim().replace(/\n/g, '\r\n'));
                callback(null, 'ABC1');
            });

            client.send({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, message, function(err) {
                expect(err).to.not.exist;
                done();
            });
        });

        it('should send message buffer', function(done) {
            var chunks = [],
                message = new Buffer(new Array(1024).join('teretere, vana kere\n'));

            server.on('data', function(connection, chunk) {
                chunks.push(chunk);
            });

            server.removeAllListeners('dataReady');
            server.on('dataReady', function(connection, callback) {
                var body = Buffer.concat(chunks);
                expect(body.toString()).to.equal(message.toString().trim().replace(/\n/g, '\r\n'));
                callback(null, 'ABC1');
            });

            client.send({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, message, function(err) {
                expect(err).to.not.exist;
                done();
            });
        });

        it('should send message stream', function(done) {
            var chunks = [],
                fname = __dirname + '/../LICENSE',
                message = fs.readFileSync(fname, 'utf-8');

            server.on('data', function(connection, chunk) {
                chunks.push(chunk);
            });

            server.removeAllListeners('dataReady');
            server.on('dataReady', function(connection, callback) {
                var body = Buffer.concat(chunks);
                expect(body.toString()).to.equal(message.toString().trim().replace(/\n/g, '\r\n'));
                callback(null, 'ABC1');
            });

            client.send({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, fs.createReadStream(fname), function(err) {
                expect(err).to.not.exist;
                done();
            });
        });
    });
});