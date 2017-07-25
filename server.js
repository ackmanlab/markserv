#!/usr/bin/env node
'use strict'

// Markdown Extension Types
const markdownExtensions = [
  '.markdown',
  '.mdown',
  '.mkdn',
  '.md',
  '.mkd',
  '.mdwn',
  '.mdtxt',
  '.mdtext',
  '.text',
  '.txt'
]

const watchExtensions = markdownExtensions.concat([
  '.less',
  '.js',
  '.css',
  '.html',
  '.htm',
  '.json',
  '.gif',
  '.png',
  '.jpg',
  '.jpeg'
])

const PORT_RANGE = {
  HTTP: [8000, 8100]
}

const http = require('http')
const path = require('path')
const fs = require('fs')

const open = require('open')
const connect = require('connect')

const micromatch = require('micromatch')
const watch = require('./lib/watch')
const sync = require('./lib/sync')

const config = {
  MarkconfDefaults: {
    watch: {
      ignore: [
      'node_modules',
      '.git*',
      '.svn',
      '.hg',
      'tmp',
      '.DS_Store'
      ]
    }
  }
}

config.MarkconfDir = process.cwd()
const watcher = watch(config)

var frontMatter = ''

const md = require('markdown-it')({ 
  html: true,
  linkify: true,
  typographer: false
})
.use(require('markdown-it-front-matter'), function(fm) {
  frontMatter = fm
})
.use(require('markdown-it-anchor'))
.use(require('markdown-it-sub'))
.use(require('markdown-it-sup'))
.use(require('markdown-it-footnote'))
.use(require('markdown-it-deflist'))
.use(require('markdown-it-katex'))

const less = require('less')
const send = require('send')
const jsdom = require('jsdom')
const flags = require('commander')
const openPort = require('openport')
const ansi = require('ansi')

const cursor = ansi(process.stdout)

const pkg = require('./package.json')

const yaml = require('js-yaml')

// Path Variables
const GitHubStyle = path.join(__dirname, 'less/github.less')
const BootStrapStyle = path.join(__dirname, 'less/bootstrap-custom.less')

// Options
flags.version(pkg.version)
  .option('-d, --dir [type]', 'Serve from directory [dir]', './')
  .option('-p, --port [type]', 'Serve on port [port]', null)
  .option('-h, --header [type]', 'Header .md file', null)
  .option('-r, --footer [type]', 'Footer .md file', null)
  .option('-n, --navigation [type]', 'Navigation .md file', null)
  .option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
  .option('-s, --less [type]', 'Path to Less styles [less]', BootStrapStyle)
  .option('-f, --file [type]', 'Open specific file in browser [file]')
  .option('-x, --x', 'Don\'t open browser on run.')
  .option('-v, --verbose', 'verbose output')
  .parse(process.argv)

const dir = flags.dir
const cssPath = flags.less
console.log(cssPath)

// Terminal Output Messages
const msg = type => cursor
  .bg.green()
  .fg.black()
  .write(' Markserv ')
  .reset()
  .fg.white()
  .write(' ' + type + ': ')
  .reset()

const errormsg = type => cursor
  .bg.red()
  .fg.black()
  .write(' Markserv ')
  .reset()
  .write(' ')
  .fg.black()
  .bg.red()
  .write(' ' + type + ': ')
  .reset()
  .fg.red()
  .write(' ')


// load phantomjs pdf making functionality
const pdf = require('html-pdf')
try {
  var options = JSON.parse(fs.readFileSync('./css/pdf-config-cover.json'))
  options.base = 'file://' + process.cwd() + '/'
} catch (err) {
  errormsg('warning')
    .write('config.json not found, making default config for html-pdf: ', err)
    .reset().write('\n')

  var options = { 
    "format": "Letter",
    "border": {
      "top": "0.5in",
      "right": "0.5in",
      "bottom": "0.5in",
      "left": "0.5in"
    },
    "footer": {
      "height": "0.5",
      "contents": {
        "first": " ",
        "default": "<div style='text-align:right;color:#adadad;font-size:0.875em'>{{page}}/{{pages}}</div>"
      }
    },
    "base": 'file://' + process.cwd() + '/'
  }
}


// hasMarkdownExtension: check whether a file is Markdown type
const hasMarkdownExtension = (fileName) => {
  const fileExtension = path.extname(fileName).toLowerCase()
  let extensionMatch = false

  markdownExtensions.forEach(extension => {
    if (extension === fileExtension) {
      extensionMatch = true
    }
  })

  return extensionMatch
}

// getFile: reads utf8 content from a file
const getFile = (fileName) => new Promise((resolve, reject) => {
  fs.readFile(fileName, 'utf8', (err, data) => {
    if (err) {
      return reject(err)
    }
    resolve(data)
  })
})

// Get Custom Less CSS to use in all Markdown files
const buildStyleSheet = (cssPath) =>
  new Promise(resolve =>
    getFile(cssPath).then(data =>
      less.render(data).then(data =>
        resolve(data.css)
      )
    )
  )

// markdownToHTML: turns a Markdown file into HTML content
const markdownToHTML = (markdownText) => new Promise(resolve => {
  resolve(md.render(markdownText))
})

// linkify: converts github style wiki markdown links to .md links
const linkify = body => new Promise((resolve, reject) => {  
  jsdom.env(body, (err, window) => {
    if (err) {
      return reject(err)
    }

    const links = window.document.getElementsByTagName('a')
    const l = links.length

    let href
    let link
    let markdownFile
    let mdFileExists
    let relativeURL
    let isFileHref

    for (let i = 0; i < l; i++) {
      link = links[i]
      href = link.href
      isFileHref = href.substr(0, 8) === 'file:///'

      markdownFile = href.replace(path.join('file://', __dirname), flags.dir) + '.md'
      mdFileExists = fs.existsSync(markdownFile)

      if (isFileHref && mdFileExists) {
        relativeURL = href.replace(path.join('file://', __dirname), '') + '.md'
        link.href = relativeURL
      }
    }

    const html = window.document.getElementsByTagName('body')[0].innerHTML

    resolve(html)
  })
})


// ---begin main build function---
// buildHTMLFromMarkDown: compiles the final HTML/CSS output from Markdown/Less files, includes JS
const buildHTMLFromMarkDown = (fileName, query) => new Promise(resolve => {
  const stack = [
    buildStyleSheet(cssPath),

    // Article
    getFile(fileName)
      .then(markdownToHTML)
      .then(linkify),

    // Header
    flags.header && getFile(flags.header)
      .then(markdownToHTML)
      .then(linkify),

    // Footer
    flags.footer && getFile(flags.footer)
      .then(markdownToHTML)
      .then(linkify),

    // Navigation
    flags.navigation && getFile(flags.navigation)
      .then(markdownToHTML)
      .then(linkify)
  ]

  Promise.all(stack).then(data => {
    const css = data[0]
    const htmlBody = data[1]
    const dirs = fileName.split('/')
    
    try {
      var metadata = yaml.safeLoad(frontMatter)
    } catch (e) {
      errormsg(e)
    }

    if (metadata) {
      console.log(metadata)
      if (!metadata.title) {
        metadata.title = dirs[dirs.length - 1].split('.md')[0]
      }
    } else {
      var metadata = {
        title: dirs[dirs.length - 1].split('.md')[0]
      }
    }

    if (query === 'pdf') {
      var dropMenuhtml = ''
    } else {
      var dropMenu = {
        pdf: fileName.slice(2) + '?pdf'
      }
      var dropMenuhtml = (

// <-- template literal block
`<div class="btn-group">
  <button type="button" onclick="menuToggle()" id="dropmenubutton" class="btn btn-xs btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
    <span class="glyphicon glyphicon-menu-hamburger"></span>
  </button>

  <ul class="dropdown-menu" id="dropmenu" role="menu" >
    <li><a href="${dropMenu.pdf}"><span class="glyphicon glyphicon-print"></span> pdf</a></li>
    <li role="separator" class="divider"></li>
  </ul>
</div>`)

    }

    let header
    let footer
    let navigation
    let outputHtml

    if (flags.header) {
      header = data[2]
    }

    if (flags.footer) {
      footer = data[3]
    }

    if (flags.navigation) {
      navigation = data[4]
    }

    //setup stylesheet
    if (flags.less === GitHubStyle) {
      var cssBlock = (

// <-- template literal block
`<style>
  ${css}
</style>
<link rel="stylesheet" href="//sindresorhus.com/github-markdown-css/github-markdown.css">`)

    } else {
      var cssBlock = (

// <-- template literal block
`<style>
  ${css}
</style>`)

    }

    //setup html and document body
    outputHtml = (

// <-- template literal block
`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${metadata.title}</title>
  <meta name="description" content="${metadata.tags}">
  <meta name="author" content="${metadata.author}">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.7.1/katex.min.css" async>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/styles/github-gist.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/languages/matlab.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/languages/r.min.js"></script>

  ${cssBlock}

  <script>
    function buildMenu() {
      const menuDiv = document.getElementById("dropmenu")
      if ( menuDiv != null && menuDiv.children.length > 0 && menuDiv.children.length < 3 ) {
        const list = document.querySelectorAll("h1, h2, h3, h4")
        let innerText = ''
        list.forEach(item => {
          const currLev = item.tagName.toLowerCase()
          const node = document.createElement("li")
          const ref = document.createElement("a")
          ref.setAttribute("href","#" + item.id)
          if (currLev === 'h1') {
            innerText = item.textContent
          } else if (currLev === 'h2') {
            innerText = "\xA0\xA0" + item.textContent
          } else if (currLev === 'h3') {
            innerText = "\xA0\xA0\xA0\xA0" + item.textContent
          } else {
            innerText = "\xA0\xA0\xA0\xA0\xA0\xA0" + item.textContent
          }
          const textnode = document.createTextNode(innerText)
          ref.appendChild(textnode)
          node.appendChild(ref)
          document.getElementById("dropmenu").appendChild(node)
        })
        menuDiv.addEventListener('click', menuToggle, false)
      }
      document.addEventListener('keydown', onDocumentKeyDown, false)
    }
  
    function onDocumentKeyDown(event) {
      switch(event.which){
        case 77:
          menuToggle()
          event.preventDefault()
        break

        case 27:
          menuToggle()
          event.preventDefault()
        break
      }  
    }

    function menuToggle() {
      const menuDiv = document.getElementById("dropmenu")
      menuDiv.classList.toggle('show')
      if (!menuDiv.classList.contains("show")) {
        document.getElementById("dropmenubutton").blur()
      }
    }

    window.onload = buildMenu
  </script>

</head>
<body>
  ${dropMenuhtml}
  <article class="markdown-body">
  ${htmlBody}
  </article>
</body>
<script>hljs.initHighlightingOnLoad()</script>
</html>`)

    resolve(outputHtml)
  })
  .catch (err => { console.log(err) })
})
// ---end main build---




// Create pdf file and save locally on server...
const printPDF = (fileName, res, query) => buildHTMLFromMarkDown(fileName, query)
  .then(html => {
    res.writeHead(200)
    res.end(html)

    console.log('Rendering pdf...')    
    const outFile = path.parse(fileName).name
    pdf.create(html, options).toFile( outFile + '.pdf', (err, res) => {
      if (err) return console.log(err)
      console.log(res)
    })
  })
  .catch (err => {
    msg('error')
    .write('Can\'t build HTML: ', err)
    .reset().write('\n')
  })

// Begin markdown compilation process, then send result when done...
const compileAndSendMarkdown = (fileName, res, query) => buildHTMLFromMarkDown(fileName, query)
  .then(html => {
    res.writeHead(200)
    res.end(html)
  })
  .catch (err => {
    msg('error')
    .write('Can\'t build HTML: ', err)
    .reset().write('\n')
  })

//setup list object for initial directory index listing
const compileAndSendDirectoryListing = (fileName, res) => {
  const urls = fs.readdirSync(fileName)
  let list = '\n    <ul>\n'

  urls.forEach(subPath => {
    const dir = fs.statSync(fileName + subPath).isDirectory()
    let href
    if (dir) {
      href = subPath + '/'
      list += `    <li class="dir"><a href="${href}">${href}</a></li> \n`
    } else {
      href = subPath
      if (subPath.split('.md')[1] === '') {
        list += `    <li class="md"><a href="${href}">${href}</a></li> \n`
      } else {
        list += `    <li class="file"><a href="${href}">${href}</a></li> \n`
      }
    }
  })
  list += '    </ul>\n'

  //setup template literal for initial directory listing
  buildStyleSheet(cssPath).then( css => {
    const html = (

`<!DOCTYPE html>
<html>
<head>
  <title>${fileName.slice(2)}</title>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.7.1/katex.min.css" async />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/styles/github-gist.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/languages/matlab.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.12.0/languages/r.min.js"></script>
  <link rel="shortcut icon" type="image/x-icon" href="https://cdn0.iconfinder.com/data/icons/octicons/1024/markdown-128.png" />
  <style>
${css}
  </style>
</head>
<body>
  <article class="markdown-body">
    <h1>Index of ${fileName.slice(2)}</h1>
    ${list}
    <sup><hr> Served by <a href="https://www.npmjs.com/package/markserv">MarkServ</a> | PID: ${process.pid}</sup>
  </article>
</body>
</html>`

    )

    // Log if verbose
    if (flags.verbose) {
      msg('index').write(fileName).reset().write('\n')
    }

    // Send file
    res.writeHead(200, {'Content-Type': 'text/html'})
    res.write(html)
    res.end()
  })
}

// Remove URL params from file being fetched
const getPathFromUrl = url => {
  return url.split(/[?#]/)[0]
}


// http_request_handler: handles all the browser requests
const httpRequestHandler = (req, res) => {
  const originalUrl = getPathFromUrl(req.originalUrl)
  const query = req.originalUrl.split(/[?]/)[1]

  if (flags.verbose) {
    msg('request')
     .write(decodeURI(dir) + decodeURI(originalUrl))
     .reset().write('\n')
  }

  const  fileName = decodeURI(dir) + decodeURI(originalUrl)

  let stat
  let isDir
  let isMarkdown

  try {
    stat = fs.statSync(fileName)
    isDir = stat.isDirectory()
    isMarkdown = false
    if (!isDir) {
      isMarkdown = hasMarkdownExtension(fileName)
    }
  } catch (err) {
    res.writeHead(200, {'Content-Type': 'text/html'})
    errormsg('404').write(fileName.slice(2)).reset().write('\n')
    res.write('404 :\'(')
    res.end()
    return
  }

  // Markdown: Browser is requesting a Markdown file
  if (query === 'pdf') {
    printPDF(fileName, res, query)
  } else if (isMarkdown) {
    msg('markdown').write(fileName.slice(2)).reset().write('\n')
    compileAndSendMarkdown(fileName, res, query)
  } else if (isDir) {
    // Index: Browser is requesting a Directory Index
    msg('dir').write(fileName.slice(2)).reset().write('\n')
    compileAndSendDirectoryListing(fileName, res)
  } else {
    // Other: Browser requests other MIME typed file (handled by 'send')
    msg('file').write(fileName.slice(2)).reset().write('\n')
    send(req, fileName, {root: dir}).pipe(res)
  }
}

let HTTP_PORT
let CONNECT_APP

const findOpenPort = range => new Promise((resolve, reject) => {
  const props = {
    startingPort: range[0],
    endingPort: range[1]
  }

  openPort.find(props, (err, port) => {
    if (err) {
      return reject(err)
    }
    resolve(port)
  })
})




// ---define the connect app promise and its four primary promise children---
const startConnectApp = () => new Promise(resolve => {
  CONNECT_APP = connect()
    .use('/', httpRequestHandler)
  resolve(CONNECT_APP)
})


const setHTTPPort = port => new Promise(resolve => {
  HTTP_PORT = port
  resolve(port)
})


const startHTTPServer = () => new Promise(resolve => {
  const HTTP_SERVER = http.createServer(CONNECT_APP)
  HTTP_SERVER.listen(HTTP_PORT, flags.address)
  resolve(HTTP_SERVER)
})


const startLiveReloadServer = () => new Promise(resolve => {
  const rootDir = process.cwd()

  //logLevel: info, debug, silent
  const syncConfig = {
    logPrefix: 'Browsersync',
    port: HTTP_PORT,
    proxy: 'localhost:' + HTTP_PORT,
    open: false,
    logLevel: 'info',
    notify: false
  }

  sync.start(syncConfig)

  const files = [
    '**/*.txt',
    '**/*.text',
    '**/*.md',
    '**/*.html'
  ]

  const watchList = []

  if (files) {
    files.forEach(filePattern => {
        watchList.push(path.join(rootDir, filePattern))
    })
  }

  const handleChanges = (changedFile, changeType) => {
    const shortPattern = path.relative(rootDir, changedFile)
    const changed = micromatch(changedFile, watchList).length > 0

    console.log(changedFile)
    console.log(shortPattern)
    console.log(changed)

    if (changed) {
      // log.info(`Watch: found ${log.hl('files')} rule ${log.hl(shortPattern)} for: ${log.hl(changeType)} ${log.ul(changedFile)}`)
      sync.reload(changedFile)
    } else {
      // log.trace(`Watch: found no rule for: ${log.hl(changeType)} ${log.ul(changedFile)}`)
      console.log('Watch: found no rule')
    }
  }

  const watchDirs = []
  watchDirs.push(rootDir)
  watcher.create(watchDirs, handleChanges)
  resolve(syncConfig)
})


const serversActivated = () => {
  const serveURL = 'http://' + flags.address + ':' + HTTP_PORT

  msg('start')
   .write('serving content from ')
   .fg.white().write(path.resolve(flags.dir)).reset()
   .write(' on port: ')
   .fg.white().write(String(HTTP_PORT)).reset()
   .write('\n')

  msg('address')
   .underline().fg.white()
   .write(serveURL).reset()
   .write('\n')

  msg('less')
   .write('using style from ')
   .fg.white().write(flags.less).reset()
   .write('\n')

  if (process.pid) {
    msg('process')
      .write('your pid is: ')
      .fg.white().write(String(process.pid)).reset()
      .write('\n')

    msg('info')
      .write('to stop this server, press: ')
      .fg.white().write('[Ctrl + C]').reset()
      .write(', or type: ')
      .fg.white().write('"kill ' + process.pid + '"').reset()
      .write('\n')
  }

  if (flags.file) {
    open(serveURL + '/' + flags.file)
  } else if (!flags.x) {
    open(serveURL)
  }
}


// Initialize MarkServ connect app
startConnectApp()
  .then(() => {
    if (flags.port === null) {
      return findOpenPort(PORT_RANGE.HTTP)
    }
    return flags.port
  })
  .then(setHTTPPort)
  .then(startHTTPServer)
  .then(startLiveReloadServer)
  .then(serversActivated)
  .catch (err => { console.log(err) })
