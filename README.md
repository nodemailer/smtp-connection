# smtp-connection

![Nodemailer](https://raw.githubusercontent.com/nodemailer/nodemailer/master/assets/nm_logo_200x136.png)

SMTP client module for Nodemailer (and others too). Connect to SMTP servers and send mail with it.

[![Build Status](https://secure.travis-ci.org/nodemailer/smtp-connection.svg)](http://travis-ci.org/nodemailer/nodemailer) [![npm version](https://badge.fury.io/js/smtp-connection.svg)](http://badge.fury.io/js/smtp-connection)

> This module is part of the [Nodemailer bundle](https://nodemailer.com/about/pricing/). Starting from v4.0.0 SMTPConnection is licensed under the [European Union Public License 1.1](http://ec.europa.eu/idabc/eupl.html). In general, EUPLv1.1 is a _copyleft_ license compatible with GPLv2, so if you're OK using GPL then you should be OK using SMTPConnection. Previous versions of SMTPConnection are licensed under the MIT license.

## Usage

Install with npm

```
npm install smtp-connection
```

Require in your script

```javascript
const SMTPConnection = require('smtp-connection');
```

### Create SMTPConnection instance

```javascript
let connection = new SMTPConnection(options);
```

Where

- **options** defines connection data

  - **options.port** is the port to connect to (defaults to 25 or 465)
  - **options.host** is the hostname or IP address to connect to (defaults to 'localhost')
  - **options.secure** defines if the connection should use SSL (if `true`) or not (if `false`)
  - **options.ignoreTLS** turns off STARTTLS support if true
  - **options.requireTLS** forces the client to use STARTTLS. Returns an error if upgrading the connection is not possible or fails.
  - **options.opportunisticTLS** tries to use STARTTLS and continues normally if it fails
  - **options.name** optional hostname of the client, used for identifying to the server
  - **options.localAddress** is the local interface to bind to for network connections
  - **options.connectionTimeout** how many milliseconds to wait for the connection to establish
  - **options.greetingTimeout** how many milliseconds to wait for the greeting after connection is established
  - **options.socketTimeout** how many milliseconds of inactivity to allow
  - **options.logger** optional [bunyan](https://github.com/trentm/node-bunyan) compatible logger instance. If set to `true` then logs to console. If value is not set or is `false` then nothing is logged
  - **options.transactionLog** if set to true, then logs SMTP traffic without message content
  - **options.debug** if set to true, then logs SMTP traffic and message content, otherwise logs only transaction events
  - **options.authMethod** defines preferred authentication method, e.g. 'PLAIN'
  - **options.tls** defines additional options to be passed to the socket constructor, e.g. _{rejectUnauthorized: true}_
  - **options.socket** - initialized socket to use instead of creating a new one
  - **options.connection** - connected socket to use instead of creating and connecting a new one. If `secure` option is true, then socket is upgraded from plaintext to ciphertext

### Events

SMTPConnection instances are event emitters with the following events

- **'error'** _(err)_ emitted when an error occurs. Connection is closed automatically in this case.
- **'connect'** emitted when the connection is established
- **'end'** when the instance is destroyed

### connect

Establish the connection

```javascript
connection.connect(callback)
```

Where

- **callback** is the function to run once the connection is established. The function is added as a listener to the 'connect' event.

After the connect event the `connection` has the following properties:

- **connection.secure** - if `true` then the connection uses a TLS socket, otherwise it is using a cleartext socket. Connection can start out as cleartext but if available (or `requireTLS` is set to true) connection upgrade is tried

### login

If the server requires authentication you can login with

```javascript
connection.login(auth, callback)
```

Where

- **auth** is the authentication object

  - **auth.user** is the username
  - **auth.pass** is the password for the user

- **callback** is the callback to run once the authentication is finished. Callback has the following arguments

  - **err** and error object if authentication failed

### send

Once the connection is authenticated (or just after connection is established if authentication is not required), you can send mail with

```javascript
connection.send(envelope, message, callback)
```

Where

- **envelope** is the envelope object to use

  - **envelope.from** is the sender address
  - **envelope.to** is the recipient address or an array of addresses
  - **envelope.size** is an optional value of the predicted size of the message in bytes. This value is used if the server supports the SIZE extension (RFC1870)
  - **envelope.use8BitMime** if `true` then inform the server that this message might contain bytes outside 7bit ascii range

- **message** is either a String, Buffer or a Stream. All newlines are converted to \r\n and all dots are escaped automatically, no need to convert anything before.

- **callback** is the callback to run once the sending is finished or failed. Callback has the following arguments

  - **err** and error object if sending failed

    - **code** string code identifying the error, for example 'EAUTH' is returned when authentication fails
    - **response** is the last response received from the server (if the error is caused by an error response from the server)
    - **responseCode** is the numeric response code of the `response` string (if available)

  - **info** information object about accepted and rejected recipients

    - **accepted** an array of accepted recipient addresses. Normally this array should contain at least one address except when in LMTP mode. In this case the message itself might have succeeded but all recipients were rejected after sending the message.
    - **rejected** an array of rejected recipient addresses. This array includes both the addresses that were rejected before sending the message and addresses rejected after sending it if using LMTP
    - **rejectedErrors** if some recipients were rejected then this property holds an array of error objects for the rejected recipients
    - **response** is the last response received from the server

### quit

Use it for graceful disconnect

```javascript
connection.quit();
```

### close

Use it for less graceful disconnect

```javascript
connection.close();
```

### reset

Use it to reset current session (invokes RSET command)

```javascript
connection.reset(callback);
```

## License

European Union Public License 1.1\. Commercial licenses available upon request. Contact [sales@nodemailer.com](mailto:sales@nodemailer.com) for details.

© 2017 Kreata OÜ
