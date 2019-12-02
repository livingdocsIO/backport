### Backport Bot

Execute that command on a pull request to backport all the commits onto the branch `release-2019-12`.
```
/backport release-2019-12
```


### How to redeploy 
First run:
```sh
docker build livingdocs/backport .
docker push livingdocs/backport

Then restart it in rancher (see 1Password for the details)
