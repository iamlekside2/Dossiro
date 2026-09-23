/**
 * PM2 process definition for the Dossiro API on the Windows development server.
 *
 * PM2 rather than IIS/iisnode, because that is what already keeps the
 * RealCousins backend alive on this machine and there is no reason for the box
 * to have two ways of running a Node process.
 *
 * .cjs rather than .js: the API package is ESM, and PM2 reads this file with
 * require().
 *
 * The environment is NOT defined here. It lives in api/.env on the server,
 * written once by hand and never deployed, so a pipeline cannot overwrite a
 * secret and a secret cannot end up in the repository. See SERVER-SETUP.md.
 */
module.exports = {
  apps: [
    {
      name: 'dossiro-api',
      script: 'dist/main.js',
      cwd: 'D:\\sites\\dossiro\\api',
      instances: 1,

      // Single instance, deliberately. Documents are on local disk until the
      // S3 driver exists, so a second instance on another machine would not
      // see the first one's files. Clustering on this box would work today and
      // would quietly become wrong the moment the app moves.
      exec_mode: 'fork',

      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',

      // A restart loop caused by a bad migration or a missing secret should
      // stop and stay stopped, not hammer Postgres every second.
      restart_delay: 4000,

      max_memory_restart: '600M',
      env: { NODE_ENV: 'production' },

      error_file: 'D:\\sites\\dossiro\\logs\\api-error.log',
      out_file: 'D:\\sites\\dossiro\\logs\\api-out.log',
      time: true,
    },
  ],
};
