'use strict';

var gulp = require('gulp');

var browserify = require('browserify');
var tsify = require('tsify');
var watchify = require('watchify');
var babelify = require('babelify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var gutil = require('gulp-util');
var sourcemaps = require('gulp-sourcemaps');
var browserSync = require('browser-sync').create();
var bower = require('gulp-bower');
var sass = require('gulp-sass');
var child = require("child_process");

gulp.task('bower', function() {
    return bower({cwd: "public"})
});

gulp.task('sass', function () {
    return gulp.src('./public/scss/**/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest('./public/css'));
});

const options = {"standalone":"amf_playground"};
const b = watchify(browserify(options));
function bundle() {
    return b
        .add([
            "src/view_model.ts"
        ])
        .plugin(tsify, { target: 'es6' })
        .transform(babelify, { extensions: [ '.tsx', '.ts' ] })
        .bundle()
        // log errors if they happen
        .on('error', gutil.log.bind(gutil, 'Browserify Error'))
        .pipe(source('amf_playground.js'))
        // optional, remove if you don't need to buffer file contents
        .pipe(buffer())
        // optional, remove if you dont want sourcemaps
        .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
        // Add transformation tasks to the pipeline here.
        .pipe(sourcemaps.write('./')) // writes .map file
        .pipe(gulp.dest('./public/js'))
        .pipe(browserSync.stream({once: true}));
}
gulp.task('bundle', bundle); // so you can run `gulp js` to build the file
b.on('update', bundle); // on any dep update, runs the bundler
b.on('log', gutil.log); // output build logs to terminal


gulp.task('serve', ["bower"], function () {
    bundle();
    browserSync.init({
        server: "public",
        startPath: "/index.html"
    });
});
