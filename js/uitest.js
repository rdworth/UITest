var UITest = new function() {
    var _testFrame = parent.frames.main;
    var _testScripts = [];
    var _activeTest = null;
    var _passed = 0;
    var _total = 0;
    
    // query string configurations
    var _runAll = parent.location.search.indexOf('all') !== -1;
    var _slowMode = parent.location.search.indexOf('slow') !== -1;
    var _noTests = top.location.search.indexOf('notests') !== -1;
    var _startIndex = parseInt(parent.location.search.substr(1), 10);


    function setStatus(status) {
        if (_activeTest) {
            document.getElementById('test-status-' + _activeTest.index).className = status;
        }
    }


    function log(message) {
        if (_activeTest) {
            message = '    - ' + message;
        } else {
            message = '\n' + message;
        }
        var textNode = document.createTextNode(message + '\r\n');
        document.getElementById('results').appendChild(textNode);
    }


    function setupAndExecute(testScript) {
        schedule(testScript);
        _testFrame.location.href = testScript.url;
    }


    function teardown(message) {
        log(message);
        
        setTimeout(function() {
            if (_activeTest.teardown) {
                _activeTest.teardown(_testFrame);
            }
            _testFrame.location.href = 'blank.html';
            _testFrame.$ = _testFrame.jQuery = $ = jQuery = _activeTest = null;
            nextTest();    
        }, 500)
    }


    function schedule(testScript) {
        try {
            if (_testFrame && _testFrame.jQuery && _testFrame.jQuery.isReady) {
                setTimeout(function() {
                    log('Starting test script ["' + testScript.name + '"] on ' + testScript.url + '', "name");
                    _activeTest = testScript;
                    setStatus('setup');
                    Facade.init(function() {
                        if (testScript.setup) {
                            testScript.setup(_testFrame);
                        }
                        if (!_noTests) {
                            setStatus('testing');
                            testScript.execute();
                        }
                    });
                }, 500);
            } else {
                setTimeout(function() {
                    schedule(testScript);
                }, 1000);
            }
        } catch(e) {
            console.error(e);
            setTimeout(function() {
                schedule(testScript);
            }, 1000);
        }
    }


    function nextTest() {
        var test = _testScripts.shift();
        if (test) {
            setupAndExecute(test);
        }
    }
    
    
    function updateProgress() {
        var perc = Math.round(_passed / _total * 100);
        var s = 'Passed ' + perc + '% [';
        for (var i = 5; i <= 100; i += 5) {
            s += (i <= perc) ? '|' : '.';
        }
        parent.document.title = s + ']';
    }


    function pass() {
        if (_activeTest) {
            setStatus('passed');
            teardown('Passed test "' + _activeTest.name + '"', null, true);
        }
    }


    this.fail = function(assertion, s) {
        if (_activeTest) {
            setStatus('failed');
            
            var message = 'Failed ' + assertion + ' in ' + _activeTest.name +': ' + s;
            teardown(message);
            throw new Error(message);
        }
    }


    this.start = function() {
        var list = document.getElementById('listtests');
        var html = '<table>'
        html += '<thead><tr><th colspan="3"><a href="index.html" target="_parent">List of tests</a></th></tr></thead>';
        html += '<tbody>';
        for (var i = 0; i < _testScripts.length; i++) {
            html += '<tr id="test-status-' + i + '">'
            html += '<th>' + _testScripts[i].name + '</th>';
            html += '<td><a href="index.html?' + i + '" target="_parent">run</a></td>';
            html += '<td><a href="index.html?' + i + '&slow" target="_parent">slow</a></td>';
            html += '<td><a href="index.html?' + i + '&notests" target="_parent">no tests</a></td>';
            html += '</tr>'
        }
        html += '<tr>'
        html += '<th>All tests</th>';
        html += '<td><a href="index.html?all" target="_parent">run</a></td>';
        html += '<td><a href="index.html?all&slow" target="_parent">slow</a></td>';
        html += '<td></td>';
        html += '</tr>'
        html += '</tbody></table>';
        list.innerHTML = html;

        if (!isNaN(_startIndex)) {
            _testScripts = _testScripts.splice(_startIndex, 1);
            _total = _testScripts[0].tests.length;
        } else if (!_runAll) {
            return;
        }
        
        nextTest();
    }


    this.addTestScript = function(testScript) {
        // For short notation
        if (testScript.waitFor && testScript.thenRun) {
            testScript.tests = [{
                waitFor: testScript.waitFor,
                thenRun: testScript.thenRun
            }];
        }

        var tests = testScript.tests;
        var wrappers = [];
        for (var i = tests.length - 1; i >= 0; i--) {
            _total++;
            wrappers[i] = function(index, selector, success) {
                return function() {
                    if (index < tests.length - 1) {
                        var nestedsuccess = function(element) {
                            try {
                                success(element);
                                _passed++;
                                updateProgress();
                                wrappers[index + 1]();
                            } catch(e) {
                                console.error(e);
                            }
                        }
                    } else {
                        var nestedsuccess = function(element) {
                            try {
                                success(element);
                                _passed++;
                                updateProgress();
                                pass();
                            } catch(e) {
                                console.error(e);
                            }
                        }
                    }
                    
                    switch (typeof selector) {
                        case 'number':
                            setTimeout(nestedsuccess, selector);
                            break;
                            
                        case 'function':
                            Facade.waitForExpressionTrue(selector, nestedsuccess, function() {
                                UITest.fail('waitForExpressionTrue', selector + ' failed');
                            });
                            break;
                            
                        case 'string':
                            if (selector.indexOf('!') === 0) {
                                Facade.waitForElementHidden(selector.substr(1), nestedsuccess, function() {
                                    UITest.fail('waitForElementHidden', selector + ' failed');
                                });
                            } else if (selector === 'pageToLoad') {
                                Facade.waitForPageToLoad(nestedsuccess, function() {
                                    UITest.fail('waitForPageToLoad', selector + ' failed');
                                });
                            } else {
                                Facade.waitForElementVisible(selector, nestedsuccess, function() {
                                    UITest.fail('waitForElementVisible', selector + ' failed');
                                });
                            }
                            break;
                    }
                }
            }(i, tests[i].waitFor, tests[i].thenRun);
        }
        testScript.execute = function() {
            updateProgress();
            wrappers[0]();
        }
        testScript.index = _testScripts.length;
        
        _testScripts.push(testScript);
    }


    this.log = function(message) {
        if (message) {
            if (_slowMode) {
                alert(message);
            }
            log(message);
        }
    }
};



var Facade = new function() {
    var init = this.init = function(callback) {
        var _testFrame = parent.frames.main;
        _testFrame.confirm = function() { return true; };
        _testFrame.onbeforeunload = null;
        $ = _testFrame.$;
        jQuery = _testFrame.jQuery;
        
        // Enable following links
        _testFrame.jQuery.fn.followLink = function() {
            try {
                var link = this[0];
                _testFrame.location.href = link.href;
            } catch(e) {
                
                for (var p in e) {
                    s += (p + ': ' + e[p]);
                }
                UITest.log(s);
            }
        };
        
        callback();
    }


    function waitForCondition(condition, callback, timeoutcallback, maxtimes) {
        if (typeof maxtimes === 'undefined') {
            maxtimes = 20;
        }

        if (maxtimes <= 0 && timeoutcallback) {
            timeoutcallback();
            return;
        }

        var result = condition();
        if (result) {
            callback(result);
        } else {
            setTimeout(function() {
                waitForCondition(condition, callback, timeoutcallback, maxtimes - 1)
            }, 1000);
        }
    }


    this.waitForPageToLoad = function(callback, timeoutcallback, maxtimes) {
        function condition() {
            var testFrame = parent.frames.main;
            return (testFrame && testFrame.jQuery && testFrame.jQuery.isReady);
        }
        waitForCondition(condition, callback, timeoutcallback);
    }


    this.waitForElementVisible = function(selector, callback, timeoutcallback, maxtimes) {
        function condition() {
            var element = $(selector);
            if (element && element.is(':visible')) {
                return element;
            }
            return null;
        }
        waitForCondition(condition, callback, timeoutcallback);
    }


    this.waitForElementHidden = function(selector, callback, timeoutcallback, maxtimes) {
        function condition() {
            var element = $(selector);
            if (!element.length || element.is(':hidden') || element.css('opacity') == 0) {
                return element;
            }
            return null;
        }
        waitForCondition(condition, callback, timeoutcallback);
    }


    this.waitForExpressionTrue = function(condition, callback, timeoutcallback, maxtimes) {
        waitForCondition(condition, callback, timeoutcallback);
    }
};




