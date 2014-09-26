# Changelog

## v1.0.0 2014-09-26

  * Changed version scheme from 0.x to 1.x.
  * Improved error handling for timeout on creating a connection. Caused issues with `once('error')` handler as an error might have been emitted twice
