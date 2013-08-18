var fs = require('fs'),
    exec = require('child_process').exec,
    request = require('request'),

    S3_URL = 'https://s3-us-west-2.amazonaws.com/',
    S3_BUCKET = 'artifacts.numenta.org',
    COVERAGE_DIR = 'artifacts/coverage',
    SUMMARY_PATH = 'coverage/summary.txt',
    MASTER = 'master',
    COMPARATOR = 'Statements';

require('colors');

function getCurrentGitBranch(callback) {
    exec('git branch', function(err, stdout) {
        var branch = stdout.split('\n').filter(function(line) {
            return line.indexOf('*') == 0;
        }).shift();
        callback(branch.split(' ').pop());
    });
}

function getRepoSlug(callback) {
    exec('git remote show origin', function(err, stdout) {
        var endOfFetchUrl = stdout.split('\n')[1].split(':').pop();
        callback(endOfFetchUrl.substr(0, endOfFetchUrl.length - 4));
    });
}

function getCoverageMap(summaryText) {
    var dataOut = {};
    summaryText.split('\n').filter(function(line) {
        return line.indexOf(':') > -1;
    }).forEach(function(dataLine) {
        var parts = dataLine.split(':').map(function(field) {
            return field.trim();
        });
        dataOut[parts.shift()] = parseFloat(parts.shift().split('%').shift());
    });
    return dataOut;
}

function compareLocalReportWithRemote(localReport, repoSlug, branch) {
    var remoteSummaryUrl = S3_URL + S3_BUCKET + '/artifacts/' 
                           + repoSlug + '/artifacts/coverage/summary.txt';
    console.info('Fetching last coverage report from ' + remoteSummaryUrl);
    request.get(remoteSummaryUrl, function(err, resp, body) {
        var remoteReport;
        if (resp.statusCode !== 200) {
            // There is no existing report for this branch.
            console.log(('No existing coverage report for this branch (' + branch + ').').yellow);
            // If this is the master branch, this must be the first time this 
            // process has run against master, so just pass it.
            if (branch == MASTER) {
                console.log('Coverage validation passed.'.green);
            } else {
                console.log('Re-running against remote coverage summary from "master" branch.');
                compareLocalReportWithRemote(localReport, repoSlug, MASTER);
            }
        } else {
            remoteReport = getCoverageMap(body);
            if (localReport[COMPARATOR] < remoteReport[COMPARATOR]) {
                console.error(
                    '\nCOVERAGE VALIDATION FAILED!\n'.red.bold +
                    'Last coverage value of ' + COMPARATOR + ': ' + (remoteReport[COMPARATOR] + '%\n').green +
                    'This coverage value of ' + COMPARATOR + ': ' + (localReport[COMPARATOR] + '%\n').yellow +
                    'See last coverage summary at ' + remoteSummaryUrl.magenta + '.\n'
                );
                process.exit(-1);
            } else {
                console.log('Coverage validation passed.'.green);
            }
        }
    });
}

(function() {
    console.log('\nComparing local code coverage to last known coverage...');
    var localSummaryText = fs.readFileSync(SUMMARY_PATH, 'utf-8');
    var localReport = getCoverageMap(localSummaryText);

    getCurrentGitBranch(function(branch) {
        getRepoSlug(function(slug) {
            compareLocalReportWithRemote(localReport, slug, branch);
        });
    });
}());
