'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var chai = require('chai');
var expect = chai.expect;
var SMTPConnection = require('../lib/smtp-connection');
var packageData = require('../package.json');
var simplesmtp = require('simplesmtp');
chai.Assertion.includeStack = true;

var PORT_NUMBER = 8397;

describe('Version test', function() {
    it('Should expose version number', function() {
        var client = new SMTPConnection();
        expect(client.version).to.equal(packageData.version);
    });
});

describe('Connection tests', function() {
    var server;

    beforeEach(function(done) {
        server = new simplesmtp.createServer();
        server.listen(PORT_NUMBER, done);
    });

    afterEach(function(done) {
        server.end(done);
    });

    it('should connect to the server', function(done) {
        var client = new SMTPConnection({
            port: PORT_NUMBER
        });

        client.connect(function() {
            client.close();
        });

        client.on('error', function(err) {
            expect(err).to.not.exist;
        });

        client.on('end', done);
    });
});