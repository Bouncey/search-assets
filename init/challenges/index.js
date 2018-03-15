const path = require('path');
const { Observable } = require('rx');
const getChallenges = require('./seed/getChallenges');
const svn = require('node-svn-ultimate');
const fs = require('fs-extra');
const { log } = require('../../utils');
const logger = log('challenge');
const {
  bulkInsert,
  bulkUpsert
} = require('../../elastic');

let isAnUpdate = false;

function dasherize(name) {
  return ('' + name)
    .toLowerCase()
    .replace(/\s/g, '-')
    .replace(/[^a-z0-9\-\.]/gi, '')
    .replace(/\:/g, '');
}

function snippetGen(description) {
  if (!description) {
    return '';
  }
  return description
    .join(' ')
    .slice(0, 100)
    .trim()
    + '...';
}

function parseAndInsert() {
  Observable.from(getChallenges())
    .flatMap(
      ({ name, challenges })=> {
        const block = dasherize(name);
        const formattedChallenges = challenges
          .reduce((acc, current) => {
            const { id, title, description } = current;
            const dashedName = dasherize(title);
            const formattedChallenge = {
              blockName: name,
              id,
              title,
              dashedName,
              description: description ? description.join('').trim() : '',
              snippet: snippetGen(description),
              url: `https://freecodecamp.org/challenges/${dashedName}`
            };
            return [ ...acc, formattedChallenge ];
          }, []);
        return Observable.of({
          block,
          challenges: formattedChallenges
        });
      }).subscribe(
            challengeBlock => {
              const { block, challenges } = challengeBlock;
              isAnUpdate ?
                bulkUpsert({ index: 'challenge', type: block, documents: challenges }) :
                bulkInsert({ index: 'challenge', type: block, documents: challenges });
            },
            err => {
              logger(err.message, 'red');
            },
            () => {
              logger('COMPLETE');
            }
          );
}

const challengesDir = path.resolve(__dirname, './seed/challenges');

function getChallengeData(update) {
  isAnUpdate = !!update;
  fs.remove(challengesDir, (err) => {
    if (err) {
      logger(err.message, 'red');
      throw new Error(err.stack);
    }
    logger('challenges removed');
    svn.commands.checkout(
      'https://github.com/freecodecamp/freecodecamp/branches/master/seed/challenges',
      challengesDir,
      (err) => {
        if (err) {
          logger(err.message, 'red');
          throw new Error(err.stack);
        }
        logger('got challenges');
        parseAndInsert();
      });
  });
}

module.exports = getChallengeData;
