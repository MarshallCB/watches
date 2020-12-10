var chokidar = require('chokidar')
import fs from 'fs'
import { promisify } from 'util'
import { init, parse } from 'es-module-lexer/dist/lexer.js';
import path from 'path'
import {totalist} from 'totalist/sync'

const readFile = promisify(fs.readFile)

function isHidden(p, ignore, only){
  // Ignore only if ignore is set and ignore test passes
  let shouldIgnore = ignore && ignore.test(p)
  // if only isn't set, include everything. Otherwise, must pass only test
  let shouldInclude = !only || only.test(p)
  // file is hidden if it shouldn't be included OR it should be ignored
  return !shouldInclude || shouldIgnore
}

// TODO: handler errors such that it waits until error is resolved before continuing
async function file_info(p, sources){
  try{
    await init;
    let js = (path.extname(p) === '.js')
    let contents = await readFile(p)
    let id=p
    sources.find(s => {
      id = p.startsWith(s) ? p.replace(s,"") : p
      // it found the correct source when id != p
      return id !== p;
    });
    let [imports, exports] = js ? parse(contents.toString('utf8')) : [null,null]
    return { imports, exports, contents, js, id }
  } catch(e){
    console.log("Error parsing " + p)
  }
}

class Jeye{
  constructor(sources, options={}){
    Object.assign(this, {
      sources: (Array.isArray(sources) ? sources : [sources]).map(path.normalize),
      options,
      targets: {},
      dependents: {},
      subscribers: {}
    })
    this.cache = options.cache || require.cache
    this.updateDependents = this.updateDependents.bind(this)
    this.effects = this.effects.bind(this)
    this.changeFile = this.changeFile.bind(this)
    this.init = this.init.bind(this)
    this.removeFile = this.removeFile.bind(this)

    this.watcher = chokidar.watch(this.sources, {
      ...options.chokidar,
      ignoreInitial: true
    })
    .on('add', this.changeFile)
    .on('change', this.changeFile)
    .on('unlink', this.removeFile)
    .on('unlinkDir', this.removeFile)

    this.init().then(() => {
      this.dispatch('ready', this.targets)
    }).catch(e => {
      this.dispatch('error', "Error initializing jeye")
      console.log(e)
    })
  }

  async changeFile(p){
    await this.updateDependents(p)
    let changed = await this.effects(p)
    await Promise.all(
      changed.map(async change => {
        await this.dispatch('change', change, this.targets[change])
      })
    )
    this.dispatch('aggregate', this.targets, changed)
  }

  async removeFile(p){
    let changed = [];
    Object.keys(this.dependents).forEach(k => {
      this.dependents[k].forEach(dep => {
        if(dep.startsWith(p)){
          this.dependents[k].delete(dep)
          changed.push(dep)
        }
      })
      if(this.dependents[k].size === 0 || k.startsWith(p)){
        delete this.dependents[k]
      }
    })
    this.dispatch('remove', p, changed)
  }

  isTarget(p){
    return this.sources.some(s => p.includes(s)) && !isHidden(p, this.options.ignore, this.options.only)
  }

  async init(){
    await init;
    this.targets = await targets(this.sources, this.options)
    await Promise.all(Object.keys(this.targets).map(this.updateDependents))
  }


  async effects(p,changed=new Set()){
    // if in source directory and isn't hidden
    if(this.isTarget(p)){
      changed.add(p)
    }
    delete this.cache[path.join(process.cwd(), p)]
    if(this.dependents[p]){
      let effect = async function(dep){
        await this.effects(dep,changed)
      }.bind(this)
      let promises = []
      this.dependents[p].forEach((dep) => {
        promises.push(effect(dep))
      })
      await Promise.all(promises)
    }
    return [...changed.values()];
  }

  async updateDependents(p){
    delete this.cache[path.join(process.cwd(), p)]
    let info = await file_info(p, this.sources)
    if(this.isTarget(p)){
      this.targets[p] = info
      this.watcher.add(p)
    }
    let updateDependents = this.updateDependents
    if(info.js){
      let promises = info.imports.map(async function({ s, e }){
        let import_str = info.contents.toString('utf8').substring(s,e)
        // only look for local imports (like './file.js' or '../file.js', not 'external-module')
        if(import_str.startsWith('.')){
          // ensure .js extension if not included in import statement
          import_str = import_str.endsWith('.js') ? import_str : import_str + '.js'
          // convert the import path to be relative to the cwd
          let import_path = path.join(p, '../', import_str)
          
          // if we haven't already tracked this file
          if(!this.dependents[import_path]){
            this.dependents[import_path] = new Set([p])
            // recursively search for dependencies to trigger file changes
            await this.updateDependents(import_path)
            // watch dependency for file changes
            this.watcher.add(import_path)
          }
          else {
            // ensure this path is included in dependency's dependents
            this.dependents[import_path].add(p)
          }
        }
      }.bind(this))
      await Promise.all(promises)
    }
  }

  async dispatch(event, ...args){
    if(this.subscribers[event]){
      let promises = []
      this.subscribers[event].forEach(callback => {
        // if callback is async, it will return a promise
        promises.push(callback.apply(null,args))
      })
      await Promise.all(promises)
    }
    
  }

  on(event, callback){
    if(this.subscribers[event]){
      this.subscribers[event].add(callback)
    } else {
      this.subscribers[event] = new Set([callback])
    }
    return this;
  }
  
}

export function watch(source, options){
  return new Jeye(source, options);
}

export async function targets(sources=[], options={}){
  let targets = {}
  let paths = []
  sources = (Array.isArray(sources) ? sources : [sources]).map(path.normalize)

  sources.map(src => {
    totalist(src,  (rel) => {
      paths.push(path.join(src, rel))
    })
  })

  // for each path, await the file_info and fill targets
  await Promise.all(paths.map(async p => {
    if(!isHidden(p, options.ignore, options.only)){
      targets[p] = await file_info(p, sources)
    }
  }))
  
  return targets
}