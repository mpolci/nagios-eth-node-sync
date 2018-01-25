#!/usr/bin/env node

'use strict'

const promisify = require("es6-promisify")
const getOpt = require('node-getopt')
  .create([
    [ 'w', 'warning=<STRING>', 'Warning threshold' ],
    [ 'c', 'critical=<STRING>', 'Critical threshold' ],
    [ 'e', 'endpoint=<STRING>', 'Ethereum rpc endpoint (default http://localhost:8545)' ],
    [ 't', 'timeout=<STRING>', 'Timeout in seconds (default 60)' ],
    [ 'h', 'help', 'display this help' ]
  ])
  .bindHelp()
getOpt.setHelp('Usage: check_eth_node_sync [Options]')
const args = getOpt.parseSystem()

const Plugin = require('nagios-plugin')
// create a new plugin object with optional initialization parameters
const o = new Plugin({
  // shortName is used in output
  shortName : 'eth_block_age'
})
// set monitor thresholds
o.setThresholds({
  'critical' : args.options.critical || 600,
  'warning' : args.options.warning || 120
})

// run the check

const Web3 = require('web3')
const endpoint = args.options.endpoint || 'http://localhost:8545'
const provider = endpoint.match(/^http(s)?:/)
  ? new Web3.providers.HttpProvider(endpoint)
  : new Web3.providers.IpcProvider(endpoint, require('net'))
const web3 = new Web3(provider)

const ms = args.options.timeout ? args.options.timeout * 1000 : 60000
const timeout = setTimeout(() => {
  o.addMessage(o.states.UNKNOWN, 'RPC timeout')
  end()
}, ms)

const getBlock = promisify(web3.eth.getBlock)
let age, latestTimestamp
Promise.resolve()
  .then(() => getBlock('latest'))
  .then((block) => {
    latestTimestamp = block.timestamp
    age = parseInt(Date.now() / 1000 - latestTimestamp)
    // o.addPerfData({
    //   label : 'time since last block',
    //   value : age,
    //   uom : 's',
    //   min : 0
    // })
    return getBlock(block.number - 1)
  })
  .then((block) => {
    age = Math.max(age, latestTimestamp - block.timestamp)
    const state = o.checkThreshold(age)
    o.addMessage(state, 'blockchain sync')
    o.addPerfData({
      label : 'time',
      value : age,
      uom : 's',
      threshold : o.threshold,
      min : 0
    })
    end()
  })
  .catch((err) => {
    const message = (err.message || err.toString()).replace(/("[^\\]*)\\n.*/, '$1"')
    o.addMessage(o.states.UNKNOWN, message)
    end()
  })

function end () {
  const messageObj = o.checkMessages()
  o.nagiosExit(messageObj.state, messageObj.message)
}
