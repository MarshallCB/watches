var { watch, scan } = require('../dist/index')

watch('test/routes', {
  cache: require.cache,
  ignore: /(^|[\/\\])[\._]./
}).on('change', (changed, total) => {
  console.log("CHANGE")
  console.log(changed)
  console.log(changed.length)
}).on('ready', (total) => {
  console.log("READY")
  console.log(total)
})