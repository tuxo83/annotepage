#!/usr/bin/env node
/* The standalone server. The whole of it is in ../src/cli.js, so the library
   and the application are one package and share one implementation. */
import { run } from '../src/cli.js';

run(process.argv.slice(2));
