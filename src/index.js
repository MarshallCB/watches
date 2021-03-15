var chokidar = require('chokidar')
import fs from 'fs'
import { promisify } from 'util'
import { init, parse } from 'es-module-lexer/dist/lexer.js';
import path from 'path'
import {totalist} from 'totalist/sync'
require = require("esm")(module)


const readFile = promisify(fs.readFile)

function isHidden(p, ignore, only){
  // Ignore only if ignore is set and ignore test passes
  let shouldIgnore = ignore && ignore.test(p)
  // if only isn't set, include everything. Otherwise, must pass only test
  let shouldInclude = !only || only.test(p)
  // file is hidden if it shouldn't be included OR it should be ignored
  return !shouldInclude || shouldIgnore
}

const cwdify = (p) => path.join(process.cwd(),p.replace(process.cwd(), ''))

async function file_info(p){
  await init;
  let js = (path.extname(p) === '.js')
  let contents = await readFile(p)
  let [imports, exports] = js ? parse(contents.toString('utf8')) : [null,null]
  return { imports, exports, contents, js, p }
}

class Watcher{
  constructor(sources, options={}){
    Object.assign(this, {
      sources: (Array.isArray(sources) ? sources : [sources]).map(s => cwdify(path.normalize(s))),
      options,
      targets: {},
      dependents: {},
      subscribers: {}
    })
    this.cache = options.cache
    this.updateDependents = this.updateDependents.bind(this)
    this.effects = this.effects.bind(this)
    this.changeFile = this.changeFile.bind(this)
    this.init = this.init.bind(this)
    this.remove = this.remove.bind(this)
    this.format = this.format.bind(this)

    this.watcher = chokidar.watch(this.sources, {
      ...options.chokidar,
      ignoreInitial: true
    })
    .on('add', this.changeFile)
    .on('change', this.changeFile)
    .on('unlink', this.remove)
    .on('unlinkDir', this.remove)

    this.init().then(() => {
      this.dispatch('ready', this.format(Object.keys(this.targets)))
    }).catch(e => {
      this.dispatch('error', "Error initializing watches")
      console.log(e)
    })
  }

  format(arr=[]){
    return arr.map(p => {
      let info = this.targets[p]
      return {
        contents: info.contents,
        module: info.js ? require(p) : void 0,
        p
      }
    })
  }

  async changeFile(p){
    try{
      p = cwdify(p)
      await this.updateDependents(p)
      let changed = await this.effects(p)
      if(changed.length > 0){
        this.dispatch('change', this.format(changed), this.format(Object.keys(this.targets)))
      }
    } catch(e){
      this.dispatch('error', e)
    }
  }

  async remove(p){
    try {
      p = cwdify(p)
      let removed = [];
      Object.keys(this.dependents).forEach(k => {
        this.dependents[k].forEach(dep => {
          if(dep.startsWith(p)){
            this.dependents[k].delete(dep)
            removed.push(dep)
          }
        })
        if(this.dependents[k].size === 0 || k.startsWith(p)){
          delete this.dependents[k]
        }
      })
      this.dispatch('remove', removed)
    } catch(e){
      this.dispatch('error', e)
    }
  }

  isTarget(p){
    return this.sources.some(s => p.startsWith(s)) && !isHidden(p, this.options.ignore, this.options.only)
  }

  async init(){
    await init;
    let targets = await scan(this.sources, this.options)
    await Promise.all(
      targets.map(({p}) => this.updateDependents(p))
    )
  }

  clearCache(p){
    if(this.cache){
      delete this.cache[p]
    }
    delete require.cache[p]
  }


  async effects(p,changed=new Set()){
    // if in source directory and isn't hidden
    if(this.isTarget(p)){
      changed.add(p)
    }
    this.clearCache(p)
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
    this.clearCache(p)
    let info = await file_info(p)
    if(this.isTarget(p)){
      this.targets[p] = info
      this.watcher.add(p)
    }
    if(info.js){
      let promises = []
      let relevant_imports = info.imports
        // get import string
        .map(({s,e}) => info.contents.toString('utf8').substring(s,e))
        // only include local imports
        .filter(str => str.startsWith('.'))
        // ensure import string includes .js extension
        .map(str => str.endsWith('.js') ? str : str + '.js') 
        // resolve import path
        .map(str => path.join(path.dirname(p), str))

      await Promise.all(
        relevant_imports.map(async import_path => {
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
        })
      )
    }
    
  }

  async dispatch(event, ...args){
    if(this.subscribers[event]){
      let promises = []
      this.subscribers[event].forEach(cb => promises.push(cb(...args)))
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

export function watch(source, cache, options){
  return new Watcher(source, cache, options);
}

export async function scan(sources=[], options={}){
  let targets = []
  sources = (Array.isArray(sources) ? sources : [sources]).map(path.normalize)

  sources.forEach(src => {
    if(fs.lstatSync(src).isDirectory()){
      totalist(src,  (rel) => {
        let p = cwdify(path.join(src,rel))
        if(!isHidden(p, options.ignore, options.only)){
          targets.push(file_info(p))
        }
      })
    } else {
      let p = cwdify(src)
      targets.push(file_info(p))
    }
  })
  
  return await Promise.all(targets)
}