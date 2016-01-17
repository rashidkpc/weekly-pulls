var fetch = require('node-fetch');
var moment = require('moment');
var _ = require('lodash');
var Promise = require('bluebird');
var markdown = require('markdown').markdown;

var credentials = require('./.github.json');
var repo = 'elastic/kibana'
var cutOff = moment().subtract(7, 'd');

var URL = 'https://api.github.com/repos/' + repo + '/pulls?sort=updated&direction=desc&state=all&per_page=100';

function addCreds (url) {
  var parts = url.split('//');
  return parts[0] + '//' + credentials.username + ':' + credentials.password + '@' + parts[1];
}

function formatPull (pull) {
  var body = '- ';

  body += pull.title + ' ';
  body += '([#' + pull.number + '](' + pull.html_url + '), ' + pull.versions.join(', ') + ')'

  return body;
}

function createPullList(pulls) {
  return _.compact(pulls.map(function (pull) {
    return formatPull(pull)
  })).join('\n') + '\n\n';
}

var pulls = fetch(addCreds(URL))
  .then(function(resp) { return resp.json(); })
  .then(function (resp) {
    return _.chain(resp)
    .filter(function (pull) {
      return moment(pull.updated_at).isAfter(cutOff)
    }).value()
  })


pulls = Promise.map(pulls, function (pull) {
  // Grab labels of pull issue so we know what branches this goes into
  return fetch(addCreds(pull.issue_url))
  .then(function(resp) { return resp.json(); })
  .then(function (resp) {
    pull.versions = _.chain(resp.labels)
      .map('name')

      // Attach .versions property to pull obj
      .filter(function (label) {
        return Boolean(label.match(/^v\d/))
      })
      .value();

    // Only return pulls that have versions attached
    if (pull.versions.length) return pull;
  })
});

Promise.all(pulls).then(function (pulls) {
  pulls = _.compact(pulls);

  var body = ''

  var closedPulls = pulls.filter(function (pull) {
    // Only show merged pulls
    return pull.merged_at;
  });

  var updatedPulls = pulls.filter(function (pull) {
    return pull.state === 'open';
  });

  body += '### Changes made this week\n\n'
  body += createPullList(closedPulls);
  body += '### In progress\n\n'
  body += createPullList(updatedPulls);

  var html = markdown.toHTML(body)

  //console.log(html);
  console.log(body);
});