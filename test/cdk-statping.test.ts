import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import { CdkStatpingStack } from '../lib/cdk-statping-stack';
import * as ecs from '@aws-cdk/aws-ecs';
import '@aws-cdk/assert/jest';
import { ResourceType } from '@aws-cdk/aws-config';

let stack: CdkStatpingStack;

test('init stack', () => {
  const app = new cdk.App();
  stack = new CdkStatpingStack(app, 'MyTestStack', {
    hostedZoneName: 'example.com',
    hostedZoneId: 'sosd',
    clusterName: 'test-cluster',
    fargateServiceProps: {
      cpu: 4096,
      memoryLimitMiB: 5120,
    },
  });
});

test('should have cluster with name', () => {
  expect(stack).toHaveResource('AWS::ECS::Cluster', {
    ClusterName: 'test-cluster',
  });
});

test('task definition should allow overwrite of cpu and memory settings', () => {
  expect(stack).toHaveResource('AWS::ECS::TaskDefinition', {
    Cpu: '4096',
    Memory: '5120',
  });
});

test('service domain is passed to contertainer envs', () => {
  expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [
      {
        Environment: [
          {
            Name: 'NAME',
            Value: 'test status page',
          },
          {
            Name: 'DESCRIPTION',
            Value: 'monitor external services',
          },
          {
            Name: 'DOMAIN',
            Value: 'https://statping.example.com',
          },
        ],
      },
    ],
  });
});
