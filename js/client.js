(function() {
    "use strict";

    var retrospectivePredictor = true,
        latestSGV,
        treatments,
        padding = { top: 20, right: 10, bottom: 30, left: 10},
        opacity = {current: 1, DAY: 1, NIGHT: 0.5},
        now = Date.now(),
        data = [],
        dateFn = function (d) { return new Date(d.date)},
        xScale, xScale2, yScale, yScale2,
        xAxis, yAxis, xAxis2, yAxis2,
        prevChartWidth = 0,
        prevChartHeight = 0,
        focusHeight,
        contextHeight,
        UPDATE_TRANS_MS = 750, // milliseconds
        brush,
        BRUSH_TIMEOUT = 300000,  // 5 minutes in ms
        brushTimer,
        brushInProgress = false,
        clip,
        TWENTY_FIVE_MINS_IN_MS = 1500000,
        THIRTY_MINS_IN_MS = 1800000,
        FORTY_TWO_MINS_IN_MS = 2520000,
        FOCUS_DATA_RANGE_MS = 12600000;  // 3.5 hours of actual data

    // create svg and g to contain the chart contents
    var charts = d3.select('#chartContainer').append('svg')
        .append('g')
        .attr('class', 'chartContainer')
        .attr('transform', 'translate(' + padding.left + ',' + padding.top + ')');

    var focus = charts.append('g');

    // create the x axis container
    focus.append('g')
        .attr('class', 'x axis');

    // create the y axis container
    focus.append('g')
        .attr('class', 'y axis');

    var context = charts.append('g');

    // create the x axis container
    context.append('g')
        .attr('class', 'x axis');

    // create the y axis container
    context.append('g')
        .attr('class', 'y axis');

    // initial setup of chart when data is first made available
    function initializeCharts() {

        // define the parts of the axis that aren't dependent on width or height
        xScale = d3.time.scale()
            .domain(d3.extent(data, function (d) { return d.date; }));

        yScale = d3.scale.log()
            .domain([30, 420]);

        xScale2 = d3.time.scale()
            .domain(d3.extent(data, function (d) { return d.date; }));

        yScale2 = d3.scale.log()
            .domain([36, 420]);
//svg is the setup of the canvas or the viewport based on the scale of data
        xAxis = d3.svg.axis()
            .scale(xScale)
            .ticks(4)
            .orient('top');

        yAxis = d3.svg.axis()
            .scale(yScale)
            .tickFormat(d3.format('d'))
            .tickValues([40, 60, 80, 120, 180, 300, 400])
            .orient('left');

        xAxis2 = d3.svg.axis()
            .scale(xScale2)
            .ticks(4)
            .orient('bottom');

        yAxis2 = d3.svg.axis()
            .scale(yScale2)
            .tickFormat(d3.format('d'))
            .tickValues([40, 60, 80, 120, 180, 300, 400])
            .orient('right');

        // setup a brush
        //allows you to select part of the canvas, .x .y are the coordinates to select.
        brush = d3.svg.brush()
            .x(xScale2)
            .on('brushstart', brushStarted)
            .on('brush', brushed)
            .on('brushend', brushEnded);
//by setting to true it jumps out of this function and goes the the updateChart function
        updateChart(true);
    }

    // get the desired opacity for context chart based on the brush extent
    function highlightBrushPoints(data) {
        if (data.date.getTime() >= brush.extent()[0].getTime() && data.date.getTime() <= brush.extent()[1].getTime()) {
            return 1
        } else {
            return 0.2
        }
    }

    // clears the current user brush and resets to the current real time data
    function updateBrushToNow() {

        // get current time range
        var dataRange = d3.extent(data, dateFn);

        // update brush and focus chart with recent data
        //.call means call the function 
        d3.select('.brush')
            .transition()
            .duration(UPDATE_TRANS_MS)
            .call(brush.extent([new Date(dataRange[1].getTime() - FOCUS_DATA_RANGE_MS), dataRange[1]]));
        brushed(true);

        // clear user brush tracking
        brushInProgress = false;
    }

    function brushStarted() {
        // update the opacity of the context data points to brush extent
        context.selectAll('circle')
            .data(data)
            .style('opacity', function(d) {return 1;} );
    }

    function brushEnded() {
        // update the opacity of the context data points to brush extent
        context.selectAll('circle')
            .data(data)
            .style('opacity', function (d) { return highlightBrushPoints(d) });
    }

    // function to call when context chart is brushed
    function brushed(skipTimer) {
        if (!skipTimer) {
            // set a timer to reset focus chart to real-time data
            clearTimeout(brushTimer);
            brushTimer = setTimeout(updateBrushToNow, BRUSH_TIMEOUT);
            brushInProgress = true;
        }

        var brushExtent = brush.extent();

        // ensure that brush extent is fixed at 3.5 hours
        if (brushExtent[1].getTime() - brushExtent[0].getTime() != FOCUS_DATA_RANGE_MS) {

            // ensure that brush updating is with the time range
            if (brushExtent[0].getTime() + FOCUS_DATA_RANGE_MS > d3.extent(data, dateFn)[1].getTime()) {
                brushExtent[0] = new Date(brushExtent[1].getTime() - FOCUS_DATA_RANGE_MS);
                d3.select('.brush')
                    .call(brush.extent([brushExtent[0], brushExtent[1]]));
            } else {
                brushExtent[1] = new Date(brushExtent[0].getTime() + FOCUS_DATA_RANGE_MS);
                d3.select('.brush')
                    .call(brush.extent([brushExtent[0], brushExtent[1]]));
            }
        }

        // get slice of data so that concatenation of predictions do interfere with subsequent updates
        var focusData = data.slice();

        // predict for retrospective data
        if (retrospectivePredictor && brushExtent[1].getTime() - THIRTY_MINS_IN_MS < now) {
            // filter data for -12 and +5 minutes from reference time for retrospective focus data prediction
            var nowData = data.filter(function(d) {
                return d.date.getTime() >= brushExtent[1].getTime() - FORTY_TWO_MINS_IN_MS &&
                    d.date.getTime() <= brushExtent[1].getTime() - TWENTY_FIVE_MINS_IN_MS
            });
            if (nowData.length > 1) {
                var prediction = predictAR(nowData);
                focusData = focusData.concat(prediction);
                $('#currentBG')
                    .text(nowData[nowData.length - 1].sgv)
                    .css('text-decoration','line-through');
            } else {
                $('#currentBG')
                    .text("---")
                    .css('text-decoration','none');
            }
            $('#currentTime')
                .text(d3.time.format('%I:%M%p')(brushExtent[1]))
                .css('text-decoration','line-through');
        } else if (retrospectivePredictor) {
            // if the brush comes back into the current time range then it should reset to the current time and sg
            var dateTime = new Date(now);
            $('#currentTime')
                .text(d3.time.format('%I:%M%p')(dateTime))
                .css('text-decoration','none');
            $('#currentBG')
                .text(latestSGV)
                .css('text-decoration','none');
        }

        xScale.domain(brush.extent());

        // bind up the focus chart data to an array of circles
        var focusCircles = focus.selectAll('circle').data(focusData, dateFn);

        // if already existing then transition each circle to its new position
        focusCircles.transition()
            .duration(UPDATE_TRANS_MS)
            .attr('cx', function (d) { return xScale(d.date); })
            .attr('cy', function (d) { return yScale(d.sgv);  })
            .attr('fill', function (d) { return d.color;      });

        // if new circle then just display
        //function d means get the data, this the key piece to display circles
        focusCircles.enter().append('circle')
            .transition()
            .duration(UPDATE_TRANS_MS)
            .attr('cx', function (d) { return xScale(d.date); })
            .attr('cy', function (d) { return yScale(d.sgv);  })
            .attr('fill', function (d) { return d.color;      })
            .attr('r', 3);  //sets size of the circles

        focusCircles.exit()
            .remove();

        // remove all insulin/carb treatment bubbles so that they can be redrawn to correct location
        d3.selectAll('.path').remove();

        // add treatment bubbles
        var bubbleSize = prevChartWidth < 400 ? 4 : (prevChartWidth < 600 ? 3 : 2);
        focus.selectAll('circle')
            .data(treatments)
            .each(function (d) { drawTreatment(d, bubbleSize, true)});

        // transition open-top line to correct location
        focus.select('.open-top')
            .attr('x1', xScale2(brush.extent()[0]))
            .attr('y1', yScale(30))
            .attr('x2', xScale2(brush.extent()[1]))
            .attr('y2', yScale(30));

        // transition open-left line to correct location
        // also x1 and y1 are coordinates of canvas selection
        focus.select('.open-left')
            .attr('x1', xScale2(brush.extent()[0]))
            .attr('y1', focusHeight)
            .attr('x2', xScale2(brush.extent()[0]))
            .attr('y2', prevChartHeight);

        // transition open-right line to correct location
        focus.select('.open-right')
            .attr('x1', xScale2(brush.extent()[1]))
            .attr('y1', focusHeight)
            .attr('x2', xScale2(brush.extent()[1]))
            .attr('y2', prevChartHeight);

        focus.select('.now-line')
            .transition()
            .duration(UPDATE_TRANS_MS)
            .attr('x1', xScale(new Date(brushExtent[1].getTime() - THIRTY_MINS_IN_MS)))
            .attr('y1', yScale(36))
            .attr('x2', xScale(new Date(brushExtent[1].getTime() - THIRTY_MINS_IN_MS)))
            .attr('y2', yScale(420));

        // update x axis
        focus.select('.x.axis')
            .call(xAxis);

        // add clipping path so that data stays within axis and does not go off the screen
        focusCircles.attr('clip-path', 'url(#clip)');
    }

    // called for initial update and updates for resize
    //this is used everytime after first draw
    function updateChart(init) {

        // get current data range
        var dataRange = d3.extent(data, dateFn);

        // get the entire container height and width subtracting the padding
        var chartWidth = (document.getElementById('chartContainer')
            .getBoundingClientRect().width) - padding.left - padding.right;

        var chartHeight = (document.getElementById('chartContainer')
            .getBoundingClientRect().height) - padding.top - padding.bottom;

        // get the height of each chart based on its container size ratio
        focusHeight = chartHeight * .7;
        contextHeight = chartHeight * .2;

        // get current brush extent
        var currentBrushExtent = brush.extent();

        // only redraw chart if chart size has changed
        if ((prevChartWidth != chartWidth) || (prevChartHeight != chartHeight)) {

            prevChartWidth = chartWidth;
            prevChartHeight = chartHeight;

            //set the width and height of the SVG element
            charts.attr('width', chartWidth + padding.left + padding.right)
                .attr('height', chartHeight + padding.top + padding.bottom);

            // ranges are based on the width and height available so reset
            xScale.range([0, chartWidth]);
            xScale2.range([0, chartWidth]);
            yScale.range([focusHeight, 0]);
            yScale2.range([chartHeight, chartHeight - contextHeight]);

            if (init) {

                // if first run then just display axis with no transition
                //transform is basically move to
                focus.select('.x')
                    .attr('transform', 'translate(0,' + focusHeight + ')')
                    .call(xAxis);

                focus.select('.y')
                    .attr('transform', 'translate(' + chartWidth + ',0)')
                    .call(yAxis);

                // if first run then just display axis with no transition
                context.select('.x')
                    .attr('transform', 'translate(0,' + chartHeight + ')')
                    .call(xAxis2);

                context.append('g')
                    .attr('class', 'x brush')
                    .call(d3.svg.brush().x(xScale2).on('brush', brushed))
                    .selectAll('rect')
                    .attr('y', focusHeight)
                    .attr('height', chartHeight - focusHeight);

                // disable resizing of brush
                d3.select('.x.brush').select('.background').style('cursor', 'move');
                d3.select('.x.brush').select('.resize.e').style('cursor', 'move');
                d3.select('.x.brush').select('.resize.w').style('cursor', 'move');

                // create a clipPath for when brushing, so last circle is not drawn off the edge
                clip = charts.append('defs')
                    .append('clipPath')
                    .attr('id', 'clip')
                    .append('rect')
                    .attr('height', chartHeight)
                    .attr('width', chartWidth);

                // add a line that marks the current time
                //todo write error checking to make sure data is clean and of good quality
                focus.append('line')
                    .attr('class', 'now-line')
                    .attr('x1', xScale(new Date(now)))
                    .attr('y1', yScale(36))
                    .attr('x2', xScale(new Date(now)))
                    .attr('y2', yScale(420))
                    .style('stroke-dasharray', ('3, 3'))
                    .attr('stroke', 'grey');

                // add a y-axis line that shows the high bg threshold
                focus.append('line')
                    .attr('class', 'high-line')
                    .attr('x1', xScale(dataRange[0]))
                    .attr('y1', yScale(180))
                    .attr('x2', xScale(dataRange[1]))
                    .attr('y2', yScale(180))
                    .style('stroke-dasharray', ('3, 3'))
                    .attr('stroke', 'grey');

                // add a y-axis line that shows the low bg threshold
                focus.append('line')
                    .attr('class', 'low-line')
                    .attr('x1', xScale(dataRange[0]))
                    .attr('y1', yScale(80))
                    .attr('x2', xScale(dataRange[1]))
                    .attr('y2', yScale(80))
                    .style('stroke-dasharray', ('3, 3'))
                    .attr('stroke', 'grey');

                // add a y-axis line that opens up the brush extent from the context to the focus
                focus.append('line')
                    .attr('class', 'open-top')
                    .attr('stroke', 'black')
                    .attr('stroke-width', 2);

                // add a x-axis line that closes the the brush container on left side
                focus.append('line')
                    .attr('class', 'open-left')
                    .attr('stroke', 'white');

                // add a x-axis line that closes the the brush container on right side
                focus.append('line')
                    .attr('class', 'open-right')
                    .attr('stroke', 'white');

                // add a line that marks the current time
                context.append('line')
                    .attr('class', 'now-line')
                    .attr('x1', xScale(new Date(now)))
                    .attr('y1', yScale2(36))
                    .attr('x2', xScale(new Date(now)))
                    .attr('y2', yScale2(420))
                    .style('stroke-dasharray', ('3, 3'))
                    .attr('stroke', 'grey');

                // add a y-axis line that shows the high bg threshold
                context.append('line')
                    .attr('class', 'high-line')
                    .attr('x1', xScale(dataRange[0]))
                    .attr('y1', yScale2(180))
                    .attr('x2', xScale(dataRange[1]))
                    .attr('y2', yScale2(180))
                    .style('stroke-dasharray', ('3, 3'))
                    .attr('stroke', 'grey');

                // add a y-axis line that shows the low bg threshold
                context.append('line')
                    .attr('class', 'low-line')
                    .attr('x1', xScale(dataRange[0]))
                    .attr('y1', yScale2(80))
                    .attr('x2', xScale(dataRange[1]))
                    .attr('y2', yScale2(80))
                    .style('stroke-dasharray', ('3, 3'))
                    .attr('stroke', 'grey');

            } else {

                // for subsequent updates use a transition to animate the axis to the new position
                var focusTransition = focus.transition().duration(UPDATE_TRANS_MS);

                focusTransition.select('.x')
                    .attr('transform', 'translate(0,' + focusHeight + ')')
                    .call(xAxis);

                focusTransition.select('.y')
                    .attr('transform', 'translate(' + chartWidth + ', 0)')
                    .call(yAxis);

                var contextTransition = context.transition().duration(UPDATE_TRANS_MS);

                contextTransition.select('.x')
                    .attr('transform', 'translate(0,' + chartHeight + ')')
                    .call(xAxis2);

                // reset clip to new dimensions
                clip.transition()
                    .attr('width', chartWidth)
                    .attr('height', chartHeight);

                // reset brush location
                context.select('.x.brush')
                    .selectAll('rect')
                    .attr('y', focusHeight)
                    .attr('height', chartHeight - focusHeight);

                // clear current brush
                d3.select('.brush').call(brush.clear());

                // redraw old brush with new dimensions
                d3.select('.brush').transition().duration(UPDATE_TRANS_MS).call(brush.extent(currentBrushExtent));

                // transition high line to correct location
                focus.select('.high-line')
                    .transition()
                    .duration(UPDATE_TRANS_MS)
                    .attr('x1', xScale(currentBrushExtent[0]))
                    .attr('y1', yScale(180))
                    .attr('x2', xScale(currentBrushExtent[1]))
                    .attr('y2', yScale(180));

                // transition low line to correct location
                focus.select('.low-line')
                    .transition()
                    .duration(UPDATE_TRANS_MS)
                    .attr('x1', xScale(currentBrushExtent[0]))
                    .attr('y1', yScale(80))
                    .attr('x2', xScale(currentBrushExtent[1]))
                    .attr('y2', yScale(80));

                // transition open-top line to correct location
                focus.select('.open-top')
                    .transition()
                    .duration(UPDATE_TRANS_MS)
                    .attr('x1', xScale2(currentBrushExtent[0]))
                    .attr('y1', yScale(30))
                    .attr('x2', xScale2(currentBrushExtent[1]))
                    .attr('y2', yScale(30));

                // transition open-left line to correct location
                focus.select('.open-left')
                    .transition()
                    .duration(UPDATE_TRANS_MS)
                    .attr('x1', xScale2(currentBrushExtent[0]))
                    .attr('y1', focusHeight)
                    .attr('x2', xScale2(currentBrushExtent[0]))
                    .attr('y2', chartHeight);

                // transition open-right line to correct location
                focus.select('.open-right')
                    .transition()
                    .duration(UPDATE_TRANS_MS)
                    .attr('x1', xScale2(currentBrushExtent[1]))
                    .attr('y1', focusHeight)
                    .attr('x2', xScale2(currentBrushExtent[1]))
                    .attr('y2', chartHeight);

                // transition high line to correct location
                context.select('.high-line')
                    .transition()
                    .duration(UPDATE_TRANS_MS)
                    .attr('x1', xScale2(dataRange[0]))
                    .attr('y1', yScale2(180))
                    .attr('x2', xScale2(dataRange[1]))
                    .attr('y2', yScale2(180));

                // transition low line to correct location
                context.select('.low-line')
                    .transition()
                    .duration(UPDATE_TRANS_MS)
                    .attr('x1', xScale2(dataRange[0]))
                    .attr('y1', yScale2(80))
                    .attr('x2', xScale2(dataRange[1]))
                    .attr('y2', yScale2(80));
            }
        }

        // update domain
        xScale2.domain(dataRange);

        context.select('.now-line')
            .transition()
            .duration(UPDATE_TRANS_MS)
            .attr('x1', xScale2(new Date(now)))
            .attr('y1', yScale2(36))
            .attr('x2', xScale2(new Date(now)))
            .attr('y2', yScale2(420));

        // only if a user brush is not active, update brush and focus chart with recent data
        // else, just transition brush
        var updateBrush = d3.select('.brush').transition().duration(UPDATE_TRANS_MS);
        if (!brushInProgress) {
            updateBrush
                .call(brush.extent([new Date(dataRange[1].getTime() - FOCUS_DATA_RANGE_MS), dataRange[1]]));
            brushed(true);
        } else {
            updateBrush
                .call(brush.extent([currentBrushExtent[0], currentBrushExtent[1]]));
            brushed(true);
        }

        // bind up the context chart data to an array of circles
        var contextCircles = context.selectAll('circle')
            .data(data);

        // if already existing then transition each circle to its new position
        //function d is a callback to display all elements
        contextCircles.transition()
            .duration(UPDATE_TRANS_MS)
            .attr('cx', function (d) { return xScale2(d.date); })
            .attr('cy', function (d) { return yScale2(d.sgv);  })
            .attr('fill', function (d) { return d.color;       })
            .style('opacity', function (d)   { return highlightBrushPoints(d) });

        // if new circle then just display
        contextCircles.enter().append('circle')
            .attr('cx', function (d)   { return xScale2(d.date); })
            .attr('cy', function (d)   { return yScale2(d.sgv);  })
            .attr('fill', function (d) { return d.color;         })
            .style('opacity', function (d)   { return highlightBrushPoints(d) })
            .attr('r', 2);  //sets size of the circles

        contextCircles.exit()
            .remove();

        // update x axis domain
        context.select('.x')
            .call(xAxis2);
    }

    // look for resize but use timer to only call the update script when a resize stops
    var resizeTimer;
    window.onresize = function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            updateChart(false);
        }, 100);
    };

    var silenceDropdown = new Dropdown(".dropdown-menu");

    $('#bgButton').click(function(e) {
        silenceDropdown.open(e);
    });

    $("#silenceBtn").find("a").click(function() {
        stopAlarm(true, $(this).data("snooze-time"));
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Client-side code to connect to server and handle incoming data
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    var isInitialData = false;
    var socket = io.connect();
//function d means get the data, now is the date from server.js which updates it constantly
    socket.on('now', function (d) {
        now = d;
        //converts epoch date
        var dateTime = new Date(now);
        $('#currentTime').text(d3.time.format('%I:%M%p')(dateTime));

        // Dim the screen by reducing the opacity when at nighttime
        if (opacity.current != opacity.NIGHT && (dateTime.getHours() > 21 || dateTime.getHours() < 7 )) {
            $('body').css({'opacity': opacity.NIGHT});
        } else {
            $('body').css({'opacity': opacity.DAY});
        }
    });
//get values, function d is a callback to loop through the array
    socket.on('sgv', function (d) {
        if (d.length > 1) {
            // change the next line so that it uses the prediction if the signal gets lost (max 1/2 hr)
            if (d[0].length) {
                latestSGV = d[0][d[0].length - 1].y;
                $('#currentBG').text(latestSGV);
                $('#bgValue').text(latestSGV);
            }
            //reads the data in loop, gets the values as they arrive and the data is the coordinates
            data = d[0].map(function (obj) { return { date: new Date(obj.x), sgv: obj.y, color: 'grey'} });
            //concat takes two arrays and turns into one
            data = data.concat(d[1].map(function (obj) { return { date: new Date(obj.x), sgv: obj.y, color: 'blue'} }));
            data = data.concat(d[2].map(function (obj) { return { date: new Date(obj.x), sgv: obj.y, color: 'red'} }));
            //if you want to see the data put a console.log(data); here
            treatments = d[3];
            if (!isInitialData) {
                isInitialData = true;
                initializeCharts();
            }
            else {
                updateChart(false);
            }
        }
    });
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Alarms and Text handling
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    socket.on('connect', function () {
        console.log('Client connected to server.')
    });
    socket.on('alarm', function() {
        console.log("Alarm raised!");
        currentAlarmType = 'alarm';
        generateAlarm(alarmSound);
    });
    socket.on('urgent_alarm', function() {
        console.log("Urgent alarm raised!");
        currentAlarmType = 'urgent_alarm';
        generateAlarm(urgentAlarmSound);
    });
    socket.on('clear_alarm', function() {
        if (alarmInProgress) {
            console.log('clearing alarm');
            stopAlarm();
        }
    });
    socket.on('clients', function(watchers) {
        console.log('number of clients has changed to ' + watchers);
        $('#watchers').text(watchers);
    });

    // load alarms
    var alarmSound = document.getElementById('audio');
    var urgentAlarmSound = document.getElementById('audio2');

    // alarm state
    var alarmInProgress = false;
    var currentAlarmType = null;

    function generateAlarm(alarmType) {
        alarmInProgress = true;
        alarmType.load();
        alarmType.play();
        var element = document.getElementById('bgButton');
        element.hidden = '';
        var element1 = document.getElementById('noButton');
        element1.hidden = 'true';
        $('#bgValue').text($('#currentBG').text());
    }

    function stopAlarm(isClient, silenceTime) {
        alarmInProgress = false;
        var element = document.getElementById('bgButton');
        element.hidden = 'true';
        element = document.getElementById('noButton');
        element.hidden = '';
        alarmSound.pause();
        urgentAlarmSound.pause();

        // only emit ack if client invoke by button press
        if (isClient) {
            socket.emit('ack', currentAlarmType, silenceTime);
        }
    }
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //draw a compact visualization of a treatment (carbs, insulin)
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    function drawTreatment(treatment, scale, showValues) {
        var carbs = treatment.carbs;
        var insulin = treatment.insulin;
        var CR = treatment.CR;

        var R1 = Math.sqrt(Math.min(carbs, insulin * CR)) / scale,
            R2 = Math.sqrt(Math.max(carbs, insulin * CR)) / scale,
            R3 = R2 + 8 / scale;

        var arc_data = [
            { 'element': '', 'color': '#9c4333', 'start': -1.5708, 'end': 1.5708, 'inner': 0, 'outer': R1 },
            { 'element': '', 'color': '#d4897b', 'start': -1.5708, 'end': 1.5708, 'inner': R1, 'outer': R2 },
            { 'element': '', 'color': 'transparent', 'start': -1.5708, 'end': 1.5708, 'inner': R2, 'outer': R3 },
            { 'element': '', 'color': '#3d53b7', 'start': 1.5708, 'end': 4.7124, 'inner': 0, 'outer': R1 },
            { 'element': '', 'color': '#5d72c9', 'start': 1.5708, 'end': 4.7124, 'inner': R1, 'outer': R2 },
            { 'element': '', 'color': 'transparent', 'start': 1.5708, 'end': 4.7124, 'inner': R2, 'outer': R3 }
        ];

        if (carbs < insulin * CR) arc_data[1].color = 'transparent';
        if (carbs > insulin * CR) arc_data[4].color = 'transparent';
        if (carbs > 0) arc_data[2].element = Math.round(carbs) + ' g';
        if (insulin > 0) arc_data[5].element = Math.round(insulin * 10) / 10 + ' U';

        var arc = d3.svg.arc()
            .innerRadius(function (d) { return 5 * d.inner; })
            .outerRadius(function (d) { return 5 * d.outer; })
            .endAngle(function (d) { return d.start; })
            .startAngle(function (d) { return d.end; });

        var treatmentDots = focus.selectAll('treatment-dot')
            .data(arc_data)
            .enter()
            .append('g')
            .attr('transform', 'translate(' + xScale(treatment.x) + ', ' + yScale(treatment.y) + ')');

        var arcs = treatmentDots.append('path')
            .attr('class', 'path')
            .attr('fill', function (d, i) { return d.color; })
            .attr('id', function (d, i) { return 's' + i; })
            .attr('d', arc);


        // labels for carbs and insulin
        if (showValues) {
            var label = treatmentDots.append('g')
                .attr('class', 'path')
                .attr('id', 'label')
                .style('fill', 'white');
            label.append('text')
                .style('font-size', 30 / scale)
                .style('font-family', 'Arial')
                .attr('text-anchor', 'middle')
                .attr('dy', '.35em')
                .attr('transform', function (d) {
                    d.outerRadius = d.outerRadius * 2.1;
                    d.innerRadius = d.outerRadius * 2.1;
                    return 'translate(' + arc.centroid(d) + ')';
                })
                .text(function (d) { return d.element; })
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // function to predict
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    function predictAR(actual) {
        console.log(actual);
        var ONE_MINUTE = 60 * 1000;
        var FIVE_MINUTES = 5 * ONE_MINUTE;
        var predicted = [];
        var BG_REF = 140;
        var BG_MIN = 36;
        var BG_MAX = 400;
        if (actual.length < 2) {
            var y = [Math.log(actual[0].sgv / BG_REF), Math.log(actual[0].sgv / BG_REF)];
        } else {
            var elapsedMins = (actual[1].date - actual[0].date) / ONE_MINUTE;
            if (elapsedMins < 5.1) {
                y = [Math.log(actual[0].sgv / BG_REF), Math.log(actual[1].sgv / BG_REF)];
            } else {
                y = [Math.log(actual[0].sgv / BG_REF), Math.log(actual[0].sgv / BG_REF)];
            }
        }
        var n = 20;
        var AR = [-0.723, 1.716];
        var dt = actual[1].date.getTime();
        for (var i = 0; i <= n; i++) {
            y = [y[1], AR[0] * y[0] + AR[1] * y[1]];
            dt = dt + FIVE_MINUTES;
            predicted[i] = {
                date: new Date(dt+3000),
                sgv: Math.max(BG_MIN, Math.min(BG_MAX, Math.round(BG_REF * Math.exp(y[1])))),
                color: 'blue'
            };
        }
        return predicted;
    }

})();
