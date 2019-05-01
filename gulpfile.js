'use strict'

const gulp = require('gulp')
const browserify = require('browserify')
const tsify = require('tsify')
const watchify = require('watchify')
const babelify = require('babelify')
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

const options = {'standalone': 'amf_playground'}
const bPlayground = watchify(browserify(options))
gulp.task('bundlePlayground', function () {
  return bPlayground
    .add([
      'src/playground/view_model.ts'
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
    .pipe(gulp.dest('./docs/js'))
    .pipe(browserSync.stream({once: true}))

})

const optionsDiff = {'standalone': 'amf_playground_diff'}
const bDiff = watchify(browserify(optionsDiff))
gulp.task('bundleDiff', function () {
  return bDiff
    .add([
      'src/diff/view_model.ts'
    ])
    .plugin(tsify, { target: 'es5' })
  // .transform(babelify, { extensions: [ '.tsx', '.ts' ] })
    .bundle()
  // log errors if they happen
    .on('error', gutil.log.bind(gutil, 'Browserify Error'))
    .pipe(source('amf_playground_diff.js'))
  // optional, remove if you don't need to buffer file contents
    .pipe(buffer())
  // optional, remove if you dont want sourcemaps
    .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
  // Add transformation tasks to the pipeline here.
    .pipe(sourcemaps.write('./')) // writes .map file
    .pipe(gulp.dest('./docs/js'))
    .pipe(browserSync.stream({once: true}))
})

const optionsVocabularies = {'standalone': 'amf_playground_vocabs'}
const bVocabularies = watchify(browserify(optionsVocabularies))
gulp.task('bundleVocabularies', function () {
  return bVocabularies
    .add([
      'src/vocabularies/view_model.ts'
    ])
    .plugin(tsify, { target: 'es5' })
  // .transform(babelify, { extensions: [ '.tsx', '.ts' ] })
    .bundle()
  // log errors if they happen
    .on('error', gutil.log.bind(gutil, 'Browserify Error'))
    .pipe(source('amf_playground_vocabs.js'))
  // optional, remove if you don't need to buffer file contents
    .pipe(buffer())
  // optional, remove if you dont want sourcemaps
    .pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
  // Add transformation tasks to the pipeline here.
    .pipe(sourcemaps.write('./')) // writes .map file
    .pipe(gulp.dest('./docs/js'))
    .pipe(browserSync.stream({once: true}))
})

gulp.task('servePlayground', gulp.series(
  'sass',
  'bower',
  'bundlePlayground',
  function () {
    browserSync.init({
      server: 'docs',
      startPath: '/playground.html'
    })
  }
))

gulp.task('serveDiff', gulp.series(
  'sass',
  'bower',
  'bundleDiff',
  function () {
    browserSync.init({
      server: 'docs',
      startPath: '/diff.html'
    })
  }
))

gulp.task('serveVocabularies', gulp.series(
  'sass',
  'bower',
  'bundleVocabularies',
  function () {
    browserSync.init({
      server: 'docs',
      startPath: '/vocabularies.html'
    })
  }
))


const optionsValidation = {'standalone': 'aml_playground_validation'}
const bCustomValidation = watchify(browserify(optionsValidation))
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
