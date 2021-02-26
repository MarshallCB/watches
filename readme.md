<div align="center">
  <img src="https://github.com/marshallcb/watches/raw/main/meta/watches.png" alt="watches" width="75" />
</div>

<h1 align="center">watches</h1>
<h3 align="center">Watch ES6 modules and their dependencies for changes</h3>

<div align="center">
  <a href="https://npmjs.org/package/watches">
    <img src="https://badgen.now.sh/npm/v/watches" alt="version" />
  </a>
  <a href="https://packagephobia.com/result?p=watches">
    <img src="https://badgen.net/packagephobia/install/watches" alt="install size" />
  </a>
</div>

# API

### `watch(source, options)`

```js
watch(['src','static'], {
  cache: require.cache, // to automatically clear require.cache on changes
  ignore: /(^|[\/\\])[\._]./, //ignore files/folders with . or _ prefix
  only: /\.js$/ // only files with a .js extension
}).on('ready', (all) => {
  console.log("READY")
  console.log(all)
}).on('change', (changed, all) => {
  console.log("CHANGE")
  console.log(changed)
  console.log(changed.length + ' targets affected')
}).on('remove', (removed) => {
  console.log("REMOVE")
  console.log(removed)
}).on('error', (e) => {
  console.log("ERROR")
  console.log(e)
})
```

### `scan(source, options)`

```js
let files = scan(['src','static'], {
  ignore: /(^|[\/\\])[\._]./, //ignore files/folders with . or _ prefix
  only: /\.js$/ // only files with a .js extension
})
console.log(files) // all matching files
```

## License

MIT © [Marshall Brandt](https://m4r.sh)