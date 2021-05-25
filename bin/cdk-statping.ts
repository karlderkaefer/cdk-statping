#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkStatpingStack } from '../lib/cdk-statping-stack';
import * as ec2 from '@aws-cdk/aws-ec2';

const app = new cdk.App();
new CdkStatpingStack(app, 'CdkStatpingStack', {
  hostedZoneId: 'Z1VKI2XXXXXXX',
  hostedZoneName: 'example.com',
  clusterName: 'statping-cluster',
  fargateLoadBalancerCidr: ec2.Peer.ipv4('212.86.39.114/32'),
});
