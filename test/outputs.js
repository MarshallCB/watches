var { watch } = require('../dist/index')

watch('test/routes', {
  ignore: /(^|[\/\\])[\._]./
}).on('change', (path, { exports, imports, code }) => {
  console.log("CHANGE")
  console.log(path, exports)
}).on('aggregate', (total, changed) => {
  console.log("AGGREGATE")
  console.log(changed + " changed")
}).on('ready', (total) => {
  console.log("READY")
  console.log(total)
})

/**
 * 
 * ___  
 * '┘'  jeye
 * 
 * https://github.com/sindresorhus/cli-spinners/blob/master/spinners.json
 * 
 * ◤⋰◢  ◤⟋◢ 
 */