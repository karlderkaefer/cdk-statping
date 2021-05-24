#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkStatpingStack } from '../lib/cdk-statping-stack';

const app = new cdk.App();
new CdkStatpingStack(app, 'CdkStatpingStack', {
  hostedZoneId: 'Z1VKI2XXXXXXX',
  hostedZoneName: 'example.com',
  clusterName: 'statping-cluster',
});
