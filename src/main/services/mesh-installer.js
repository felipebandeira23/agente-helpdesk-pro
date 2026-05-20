const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

function checkMeshAgentStatus() {
  return new Promise((resolve) => {
    // Check if the Mesh Agent service is installed and running
    exec('sc query "Mesh Agent"', (err, stdout, stderr) => {
      if (err || stderr) {
        resolve('NotInstalled');
        return;
      }
      
      if (stdout.includes('RUNNING')) {
        resolve('Running');
      } else if (stdout.includes('STOPPED')) {
        resolve('Stopped');
      } else {
        resolve('NotInstalled');
      }
    });
  });
}

async function ensureMeshAgentInstalled() {
  try {
    const status = await checkMeshAgentStatus();
    if (status === 'Running') {
      logger.info('Mesh Agent is already running as a service.', 'MESH');
      return true;
    }
    logger.warn(`Mesh Agent status is ${status}. Manual intervention or QuickSupport required.`, 'MESH');
    return false;
  } catch (err) {
    logger.error('Failed to check Mesh Agent status:', err, 'MESH');
    return false;
  }
}

module.exports = {
  checkMeshAgentStatus,
  ensureMeshAgentInstalled
};
