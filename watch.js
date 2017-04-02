const path = require('path')

const chokidar = require('chokidar')

// const log = require('app/lib/core/log')

module.exports = config => {
	const ignore = config.MarkconfDefaults.watch.ignore
	let watcher

	return {
		create: (dirs, callback) => {
			// dirs.forEach(dir => {
			// 	let relativePath = path.relative(config.MarkconfDir, dir)

			// 	if (relativePath.length === 0) {
			// 		relativePath = config.MarkconfDir
			// 	}

			// 	// log.info(log.hl('Watch: ') + log.ul(relativePath))
			// })

			watcher = chokidar.watch(dirs, {
				ignored: ignore,
				persistent: true,
				followSymlinks: false
			})

			watcher.on('ready', () => {
				// log.trace('Watch: initial scan complete.')

				watcher.on('add', path => {
					console.log('Watch: add: ' + path)
					callback(path, 'add')
				})

				watcher.on('change', path => {
					console.log('Watch: changed: ' + path)
					callback(path, 'change')
				})

				watcher.on('unlink', path => {
					// log.trace(`Watch: unlinked: ${log.ul(path)}`)
					callback(path, 'unlink')
				})
			})

			return watcher
		},

		add: (...files) => {
			console.log('Watch: setup: adding files to watch list.')
			watcher.add(files)
			return watcher
		},

		close: () => {
			console.log('Watch: close: closing watcher.')
			watcher.close()
			return watcher
		}
	}
}

