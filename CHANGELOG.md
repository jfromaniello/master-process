# Changelog

<a name="v4.2.0"></a>
 # v4.2.0
### Feature
* Add Typescript definition

<a name="v4.1.0"></a>
 # v4.1.0
### Feature
* Add support for Node 12.x and 14.x

<a name="v4.0.0"></a>
 # v4.0.0
### Feature
* Add new `WORKERS=MAX` to use `number of cores` (previously `AUTO`)
* Add new `MAX_CPU_ALLOWED` to allow control CPU monitor
### Breaking Changes
* Change behavior of `WORKERS=AUTO` to `number of cores - 1`

<a name="v3.0.0"></a>
 # v3.0.0
### Feature
* Replaces worker processes that crash/exit unexpectedly
### Security
* Updated dependencies to newer versions
### Removed
* Removed deprecated `RELOAD_WORKER` environment variable
