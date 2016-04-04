var fetch = require('node-fetch');
var moment = require('moment');
var _ = require('lodash');
var Promise = require('bluebird');
var markdown = require('markdown').markdown;

var credentials = require('./.github.json');
var repo = 'elastic/kibana'
var cutOff = moment().subtract(9, 'd');

var URL = 'https://api.github.com/repos/' + repo + '/pulls?sort=updated&direction=desc&state=all&per_page=100';

function addCreds (url, page) {
  var parts = url.split('//');
  return parts[0] + '//' + credentials.username + ':' + credentials.password + '@' + parts[1] + '&page=' + page;
}

var getPulls = function(page) {
  return fetch(addCreds(URL, page))
    .then(function(resp) { return resp.json(); })
}

var pages = _.map(_.times(10, Number), function (page) {
  return getPulls(page);
})

var pulls = Promise.map(pages, function (page) {
  return _.chain(page)
    .filter(function (pull) {
      if (!(pull && pull.updated_at)) return;
      return moment(pull.updated_at).isAfter(cutOff)
    }).value();
}).then(function (pages) {
  return _.chain(pages).flatten().compact().sortBy(function (pull) {
    return moment(pull.updated_at).valueOf() * -1;
  });
});

/*
var pulls = fetch(addCreds(URL))
  .then(function(resp) { return resp.json(); })
  .then(function (resp) {
    return _.chain(resp)
    .filter(function (pull) {
      console.log(pull.updated_at, pull.title, pull.html_url);
      return moment(pull.updated_at).isAfter(cutOff)
    }).value()
  })
*/



var pulls = Promise.map(pulls, function (pull) {

  console.log(pull.updated_at, pull.title, pull.html_url);

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
    return pull;
  })
});

function createPullList(pulls) {
  return _.compact(pulls.map(function (pull) {
    return formatPull(pull)
  })).join('\n') + '\n\n';
}

function formatPull (pull) {
  var body = '- ';

  body += pull.title + ' ';
  body += '([#' + pull.number + '](' + pull.html_url + ')';
  if (pull.versions.length) {
    body += ', ' + pull.versions.join(', ');
  }
  body += ')';

  return body;
}

Promise.all(pulls).then(function (pulls) {
  pulls = _.compact(pulls);

  var body = ''

  var closedPulls = pulls.filter(function (pull) {
    // Only show merged pulls
    if (moment(pull.merged_at) < cutOff) return 0;
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
  console.log(body);

  console.log('\n\n\n------------------\n\n\n');

  console.log(html);
  //console.log(body);
});
