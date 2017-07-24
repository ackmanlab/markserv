const browserSync = require('browser-sync')
let serverInstance = false

const start = (syncConfig) => {
  console.log('Initiating browserSync')
  console.log(syncConfig)
  browserSync.init(syncConfig)
  serverInstance = browserSync.create()
  return serverInstance
}

const isActive = () => {
  return serverInstance !== false;
}

const stop = () => {
  console.log('Stopping BrowserSync')
  browserSync.exit()
  serverInstance = false;
  return serverInstance;
}

const reload = () => {
  console.log('Reloading BrowserSync')
  browserSync.reload()
}

module.exports = {
  start,
  isActive,
  stop,
  reload
}
