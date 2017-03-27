#!/usr/bin/env node

'use strict';

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
];

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
]);

const PORT_RANGE = {
  HTTP: [8000, 8100],
  LIVE_RELOAD: [35729, 35829]
};

const http = require('http');
const path = require('path');
const fs = require('fs');

const open = require('open');
const Promise = require('bluebird');
const connect = require('connect');

var frontMatter = '';

const md = require('markdown-it')({ 
  html: true,
  linkify: true,
  typographer: false
})
.use(require('markdown-it-front-matter'), function(fm) {
  frontMatter = fm;
})
.use(require('markdown-it-sub'))
.use(require('markdown-it-sup'))
.use(require('markdown-it-footnote'))
.use(require('markdown-it-deflist'))
.use(require('markdown-it-mathjax')());

const less = require('less');
const send = require('send');
const jsdom = require('jsdom');
const flags = require('commander');
const liveReload = require('livereload');
const openPort = require('openport');
const connectLiveReload = require('connect-livereload');
const ansi = require('ansi');

const cursor = ansi(process.stdout);

const pkg = require('./package.json');

var pdf = require('html-pdf');
var options = JSON.parse(fs.readFileSync('./config.json'));
options.base = 'file://' + process.cwd() + '/';
const yaml = require('js-yaml');

console.log(options)

// const printMetadata = frontMatter => {
//   console.log(frontMatter);
// };



// Path Variables
const GitHubStyle = path.join(__dirname, 'less/github.less');

// Options
flags.version(pkg.version)
  .option('-d, --dir [type]', 'Serve from directory [dir]', './')
  .option('-p, --port [type]', 'Serve on port [port]', null)
  .option('-h, --header [type]', 'Header .md file', null)
  .option('-r, --footer [type]', 'Footer .md file', null)
  .option('-n, --navigation [type]', 'Navigation .md file', null)
  .option('-a, --address [type]', 'Serve on ip/address [address]', 'localhost')
  .option('-s, --less [type]', 'Path to Less styles [less]', GitHubStyle)
  .option('-f, --file [type]', 'Open specific file in browser [file]')
  .option('-x, --x', 'Don\'t open browser on run.')
  .option('-v, --verbose', 'verbose output')
  .parse(process.argv);

const dir = flags.dir;
const cssPath = flags.less;

// const makeHeaders = frontMatter ==> {

//     if (flags.less === GitHubStyle) {
//       outputHtml = `
//         <!DOCTYPE html>
//           <head>
//             <title>${title}</title>
//             <meta charset="utf-8">
//             <style>${css}</style>
//             <link rel="stylesheet" href="//sindresorhus.com/github-markdown-css/github-markdown.css">
//             <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
//             <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.10.0/highlight.min.js"></script>
//             <link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
//             <script type="text/x-mathjax-config">
// MathJax.Hub.Config({
//   tex2jax: {inlineMath: [['$','$']]}
// });
// </script>
// <script type="text/javascript" async
//   src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-MML-AM_CHTML">
// </script>
//           </head>
//           <body>
//             <article class="markdown-body">${htmlBody}</article>
//           </body>
//           <script src="http://localhost:35729/livereload.js?snipver=1"></script>
//           <script>hljs.initHighlightingOnLoad();</script>`;
//     } else {
//       outputHtml = `
//         <!DOCTYPE html>
//           <head>
//             <meta charset="utf-8">
//             <title>${title}</title>
//             <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
//             <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.10.0/highlight.min.js"></script>
//             <link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
//             <style>${css}</style>
//             <script type="text/x-mathjax-config">
// MathJax.Hub.Config({
//   tex2jax: {inlineMath: [['$','$']]}
// });
// </script>
// <script type="text/javascript" async
//   src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-MML-AM_CHTML">
// </script>
//           </head>
//           <body>
//             <div class="container">
//               ${(header ? '<header>' + header + '</header>' : '')}
//               ${(navigation ? '<nav>' + navigation + '</nav>' : '')}
//               <article>${htmlBody}</article>
//               ${(footer ? '<footer>' + footer + '</footer>' : '')}
//             </div>
//           </body>
//           <script src="http://localhost:35729/livereload.js?snipver=1"></script>
//           <script>hljs.initHighlightingOnLoad();</script>`;
//     }
// };






// Terminal Output Messages
const msg = type => cursor
  .bg.green()
  .fg.black()
  .write(' Markserv ')
  .reset()
  .fg.white()
  .write(' ' + type + ': ')
  .reset();

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
  .write(' ');

// hasMarkdownExtension: check whether a file is Markdown type
const hasMarkdownExtension = fileName => {
  const fileExtension = path.extname(fileName).toLowerCase();
  let extensionMatch = false;

  markdownExtensions.forEach(extension => {
    if (extension === fileExtension) {
      extensionMatch = true;
    }
  });

  return extensionMatch;
};

// getFile: reads utf8 content from a file
const getFile = fileName => new Promise((resolve, reject) => {
  fs.readFile(fileName, 'utf8', (err, data) => {
    if (err) {
      return reject(err);
    }
    resolve(data);
  });
});

// Get Custom Less CSS to use in all Markdown files
const buildStyleSheet = cssPath =>
  new Promise(resolve =>
    getFile(cssPath).then(data =>
      less.render(data).then(data =>
        resolve(data.css)
      )
    )
  );

// markdownToHTML: turns a Markdown file into HTML content
const markdownToHTML = markdownText => new Promise(resolve => {
  resolve(md.render(markdownText));
});

// linkify: converts github style wiki markdown links to .md links
const linkify = body => new Promise((resolve, reject) => {  
  jsdom.env(body, (err, window) => {
    if (err) {
      return reject(err);
    }

    const links = window.document.getElementsByTagName('a');
    const l = links.length;

    let href;
    let link;
    let markdownFile;
    let mdFileExists;
    let relativeURL;
    let isFileHref;

    for (let i = 0; i < l; i++) {
      link = links[i];
      href = link.href;
      isFileHref = href.substr(0, 8) === 'file:///';

      markdownFile = href.replace(path.join('file://', __dirname), flags.dir) + '.md';
      mdFileExists = fs.existsSync(markdownFile);

      if (isFileHref && mdFileExists) {
        relativeURL = href.replace(path.join('file://', __dirname), '') + '.md';
        link.href = relativeURL;
      }
    }

    const html = window.document.getElementsByTagName('body')[0].innerHTML;

    resolve(html);
  });
});

// buildHTMLFromMarkDown: compiles the final HTML/CSS output from Markdown/Less files, includes JS
const buildHTMLFromMarkDown = markdownPath => new Promise(resolve => {
  const stack = [
    buildStyleSheet(cssPath),

    // Article
    getFile(markdownPath)
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
  ];

  Promise.all(stack).then(data => {
    const css = data[0];
    const htmlBody = data[1];
    const dirs = markdownPath.split('/');
    const title = dirs[dirs.length - 1].split('.md')[0];

    let header;
    let footer;
    let navigation;
    let outputHtml;

    console.log(yaml.parse(frontMatter));

    if (flags.header) {
      header = data[2];
    }

    if (flags.footer) {
      footer = data[3];
    }

    if (flags.navigation) {
      navigation = data[4];
    }

    if (flags.less === GitHubStyle) {
      outputHtml = `
        <!DOCTYPE html>
          <head>
            <title>${title}</title>
            <meta charset="utf-8">
            <style>${css}</style>
            <link rel="stylesheet" href="//sindresorhus.com/github-markdown-css/github-markdown.css">
            <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.10.0/highlight.min.js"></script>
            <link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
            <script type="text/x-mathjax-config">
            MathJax.Hub.Config({
              tex2jax: {inlineMath: [['$','$']]}
            });
            </script>
            <script type="text/javascript" async
              src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-MML-AM_CHTML">
            </script>
          </head>
          <body>
            <article class="markdown-body">${htmlBody}</article>
          </body>
          <script src="http://localhost:35729/livereload.js?snipver=1"></script>
          <script>hljs.initHighlightingOnLoad();</script>`;
    } else {
      outputHtml = `
        <!DOCTYPE html>
          <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.10.0/highlight.min.js"></script>
            <link rel="stylesheet" href="https://highlightjs.org/static/demo/styles/github-gist.css">
            <style>${css}</style>
            <script type="text/x-mathjax-config">
            MathJax.Hub.Config({
              tex2jax: {inlineMath: [['$','$']]}
            });
            </script>
            <script type="text/javascript" async
              src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-MML-AM_CHTML">
            </script>
          </head>
          <body>
            <div class="container">
              ${(header ? '<header>' + header + '</header>' : '')}
              ${(navigation ? '<nav>' + navigation + '</nav>' : '')}
              <article>${htmlBody}</article>
              ${(footer ? '<footer>' + footer + '</footer>' : '')}
            </div>
          </body>
          <script src="http://localhost:35729/livereload.js?snipver=1"></script>
          <script>hljs.initHighlightingOnLoad();</script>`;
    }
    resolve(outputHtml);
  });
});

// markItDown: begins the Markdown compilation process, then sends result when done...
const printPDF = (fileName, res, query) => buildHTMLFromMarkDown(fileName)
  .then(html => {
    res.writeHead(200);
    res.end(html)

    console.log('Rendering pdf now...')    
    var outFile = path.parse(fileName).name;
    pdf.create(html, options).toFile(outFile + '.pdf', function(err, res) {
      if (err) return console.log(err);
      console.log(res);
    });
  // Catch if something breaks...
  }).catch(err => {
    msg('error')
    .write('Can\'t build HTML: ', err)
    .reset().write('\n');
  });

// markItDown: begins the Markdown compilation process, then sends result when done...
const compileAndSendMarkdown = (fileName, res) => buildHTMLFromMarkDown(fileName)
  .then(html => {
    res.writeHead(200);
    res.end(html);

  // Catch if something breaks...
  }).catch(err => {
    msg('error')
    .write('Can\'t build HTML: ', err)
    .reset().write('\n');
  });

const compileAndSendDirectoryListing = (fileName, res) => {
  const urls = fs.readdirSync(fileName);
  let list = '<ul>\n';

  urls.forEach(subPath => {
    const dir = fs.statSync(fileName + subPath).isDirectory();
    let href;
    if (dir) {
      href = subPath + '/';
      list += `\t<li class="dir"><a href="${href}">${href}</a></li> \n`;
    } else {
      href = subPath;
      if (subPath.split('.md')[1] === '') {
        list += `\t<li class="md"><a href="${href}">${href}</a></li> \n`;
      } else {
        list += `\t<li class="file"><a href="${href}">${href}</a></li> \n`;
      }
    }
  });

  list += '</ul>\n';

  buildStyleSheet(cssPath).then(css => {
    const html = `
      <!DOCTYPE html>
        <head>
          <title>${fileName.slice(2)}</title>
          <meta charset="utf-8">
          <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.10.0/highlight.min.js"></script>
          <link rel="stylesheet" href="//highlightjs.org/static/demo/styles/github-gist.css">
          <link rel="shortcut icon" type="image/x-icon" href="https://cdn0.iconfinder.com/data/icons/octicons/1024/markdown-128.png" />
          <style>${css}</style>
        </head>
        <body>
          <article class="markdown-body">
            <h1>Index of ${fileName.slice(2)}</h1>${list}
            <sup><hr> Served by <a href="https://www.npmjs.com/package/markserv">MarkServ</a> | PID: ${process.pid}</sup>
          </article>
        </body>
        <script src="http://localhost:35729/livereload.js?snipver=1"></script>`;

    // Log if verbose

    if (flags.verbose) {
      msg('index').write(fileName).reset().write('\n');
    }

    // Send file
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(html);
    res.end();
  });
};

// Remove URL params from file being fetched
const getPathFromUrl = url => {
  return url.split(/[?#]/)[0];
};

// Get URL params from file being fetched
const getQueryFromUrl = url => {
  return url.split(/[?]/)[1];
};

// http_request_handler: handles all the browser requests
const httpRequestHandler = (req, res) => {
  const originalUrl = getPathFromUrl(req.originalUrl);
  const query = getQueryFromUrl(req.originalUrl);

  if (flags.verbose) {
    msg('request')
     .write(decodeURI(dir) + decodeURI(originalUrl))
     .reset().write('\n');
  }

  const fileName = decodeURI(dir) + decodeURI(originalUrl);

  let stat;
  let isDir;
  let isMarkdown;

  try {
    stat = fs.statSync(fileName);
    isDir = stat.isDirectory();
    isMarkdown = false;
    if (!isDir) {
      isMarkdown = hasMarkdownExtension(fileName);
    }
  } catch (err) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    errormsg('404').write(fileName.slice(2)).reset().write('\n');
    res.write('404 :\'(');
    res.end();
    return;
  }

  // Markdown: Browser is requesting a Markdown file
  if (query === 'pdf') {
    printPDF(fileName, res, query);
  } else if (isMarkdown) {
    msg('markdown').write(fileName.slice(2)).reset().write('\n');
    compileAndSendMarkdown(fileName, res);
  } else if (isDir) {
    // Index: Browser is requesting a Directory Index
    msg('dir').write(fileName.slice(2)).reset().write('\n');
    compileAndSendDirectoryListing(fileName, res);
  } else {
    // Other: Browser requests other MIME typed file (handled by 'send')
    msg('file').write(fileName.slice(2)).reset().write('\n');
    send(req, fileName, {root: dir}).pipe(res);
  }
};

let LIVE_RELOAD_PORT;
let LIVE_RELOAD_SERVER;
let HTTP_PORT;
let HTTP_SERVER;
let CONNECT_APP;

const findOpenPort = range => new Promise((resolve, reject) => {
  const props = {
    startingPort: range[0],
    endingPort: range[1]
  };

  openPort.find(props, (err, port) => {
    if (err) {
      return reject(err);
    }
    resolve(port);
  });
});

const setLiveReloadPort = port => new Promise(resolve => {
  LIVE_RELOAD_PORT = port;
  resolve(port);
});

const setHTTPPort = port => new Promise(resolve => {
  HTTP_PORT = port;
  resolve(port);
});

const startConnectApp = () => new Promise(resolve => {
  CONNECT_APP = connect()
    .use('/', httpRequestHandler)
    .use(connectLiveReload({
      port: LIVE_RELOAD_PORT
    }));
  resolve(CONNECT_APP);
});

const startHTTPServer = () => new Promise(resolve => {
  HTTP_SERVER = http.createServer(CONNECT_APP);
  HTTP_SERVER.listen(HTTP_PORT, flags.address);
  resolve(HTTP_SERVER);
});

const startLiveReloadServer = () => new Promise(resolve => {
  LIVE_RELOAD_SERVER = liveReload.createServer({
    exts: watchExtensions,
    port: LIVE_RELOAD_PORT
  }).watch(flags.dir);

  resolve(LIVE_RELOAD_SERVER);
});

const serversActivated = () => {
  const serveURL = 'http://' + flags.address + ':' + HTTP_PORT;

  msg('start')
   .write('serving content from ')
   .fg.white().write(path.resolve(flags.dir)).reset()
   .write(' on port: ')
   .fg.white().write(String(HTTP_PORT)).reset()
   .write('\n');

  msg('address')
   .underline().fg.white()
   .write(serveURL).reset()
   .write('\n');

  msg('less')
   .write('using style from ')
   .fg.white().write(flags.less).reset()
   .write('\n');

  msg('livereload')
    .write('communicating on port: ')
    .fg.white().write(String(LIVE_RELOAD_PORT)).reset()
    .write('\n');

  if (process.pid) {
    msg('process')
      .write('your pid is: ')
      .fg.white().write(String(process.pid)).reset()
      .write('\n');

    msg('info')
      .write('to stop this server, press: ')
      .fg.white().write('[Ctrl + C]').reset()
      .write(', or type: ')
      .fg.white().write('"kill ' + process.pid + '"').reset()
      .write('\n');
  }

  if (flags.file) {
    open(serveURL + '/' + flags.file);
  } else if (!flags.x) {
    open(serveURL);
  }
};

// Initialize MarkServ
findOpenPort(PORT_RANGE.LIVE_RELOAD)
  .then(setLiveReloadPort)
  .then(startConnectApp)
  .then(() => {
    if (flags.port === null) {
      return findOpenPort(PORT_RANGE.HTTP);
    }
    return flags.port;
  })
  .then(setHTTPPort)
  .then(startHTTPServer)
  .then(startLiveReloadServer)
  .then(serversActivated);
