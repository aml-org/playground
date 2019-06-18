'use strict'

const gulp = require('gulp')
const browserify = require('browserify')
const tsify = require('tsify')
const source = require('vinyl-source-stream')
const buffer = require('vinyl-buffer')
const gutil = require('gulp-util')
const sourcemaps = require('gulp-sourcemaps')
const browserSync = require('browser-sync').create()
const bower = require('gulp-bower')
const sass = require('gulp-sass')

gulp.task('bower', function () {
  return bower({cwd: 'docs'})
})

gulp.task('sass', function () {
  return gulp.src('./docs/scss/**/*.scss')
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest('./docs/css'))
})

const optionsValidation = {'standalone': 'aml_playground_validation'}
const bCustomValidation = browserify(optionsValidation)
gulp.task('bundleValidation', function () {
  return bCustomValidation
    .add([
      'src/validation/view_model.ts'
    ])
    .plugin(tsify, { target: 'es5' })
    .bundle()
    .on('error', gutil.log.bind(gutil, 'Browserify Error'))
    .pipe(source('aml_playground_validation.js'))
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
    .pipe(sourcemaps.write('./')) // writes .map file
    .pipe(gulp.dest('./docs/js'))
    .pipe(browserSync.stream({once: true}))
})

const optionsVisualization = {'standalone': 'aml_playground_visualization'}
const bCustomVisualization = browserify(optionsVisualization)
gulp.task('bundleVisualization', function () {
  return bCustomVisualization
    .add([
      'src/visualization/view_model.ts'
    ])
    .plugin(tsify, { target: 'es5' })
    .bundle()
    .on('error', gutil.log.bind(gutil, 'Browserify Error'))
    .pipe(source('aml_playground_visualization.js'))
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
    .pipe(sourcemaps.write('./')) // writes .map file
    .pipe(gulp.dest('./docs/js'))
    .pipe(browserSync.stream({once: true}))
})

gulp.task('serveValidation', gulp.series(
  'sass',
  'bower',
  'bundleValidation',
  function () {
    browserSync.init({
      server: 'docs',
      startPath: '/validation.html'
    })
  }
))

gulp.task('serveVisualization', gulp.series(
  'sass',
  'bower',
  'bundleVisualization',
  function () {
    browserSync.init({
      server: 'docs',
      startPath: '/visualization.html'
    })
  }
))

// Bundle all the demos
gulp.task('bundle', gulp.series(
  'sass',
  'bower',
  'bundleValidation',
  'bundleVisualization'
))
